const { randomUUID } = require('node:crypto');
const repository = require('./sourceSyncRepository');
const { CanonicalizationError, canonicalizeSourcePayload } = require('./sourceCanonicalizer');

const DEFAULT_POLL_MS = 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_STALE_MS = 5 * 60 * 1000;

function positiveInteger(value, fallback, minimum = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function retryDelayMs(attempt) {
  return Math.min(5 * 60 * 1000, 5000 * (2 ** Math.max(0, attempt - 1)));
}

function classifySyncError(cause) {
  if (cause instanceof CanonicalizationError || cause?.retryable === false) return cause;
  if (cause?.code === 'IIG_SOURCE_SNAPSHOT_MISSING') return cause;
  const error = Object.assign(new Error(cause?.message || 'Failed to persist canonical IIG source data.'), {
    code: cause?.code || 'IIG_SOURCE_SYNC_FAILED',
    retryable: true,
    cause,
  });
  return error;
}

async function processEvent(event, dependencies = {}) {
  const deps = {
    repository: dependencies.repository || repository,
    maxAttempts: positiveInteger(
      dependencies.maxAttempts ?? process.env.IIG_INGESTION_SYNC_MAX_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS
    ),
  };
  try {
    const snapshotHash = String(event.payload?.snapshotHash || '').trim();
    const payload = snapshotHash
      ? await deps.repository.loadSnapshot(event.jobId, snapshotHash)
      : null;
    if (!payload) {
      throw Object.assign(new Error('The source snapshot required for canonical sync is unavailable.'), {
        code: 'IIG_SOURCE_SNAPSHOT_MISSING',
        retryable: false,
      });
    }
    const canonical = canonicalizeSourcePayload(payload);
    const result = await deps.repository.completeSync({ event, canonical });
    return {
      status: 'completed',
      jobId: event.jobId,
      questionCount: canonical.questions.length,
      ...result,
    };
  } catch (cause) {
    const error = classifySyncError(cause);
    if (error.retryable && event.publishAttempts < deps.maxAttempts) {
      const delayMs = retryDelayMs(event.publishAttempts);
      await deps.repository.markRetry({ event, error, delayMs });
      return { status: 'retry', jobId: event.jobId, code: error.code, delayMs };
    }
    await deps.repository.markDeadLetter({ event, error });
    return { status: 'dead_letter', jobId: event.jobId, code: error.code };
  }
}

let timer = null;
let running = false;
const workerId = `source-sync-${process.pid}-${randomUUID()}`;

async function runOnce(dependencies = {}) {
  if (running) return null;
  running = true;
  const syncRepository = dependencies.repository || repository;
  try {
    const event = await syncRepository.claimNext(dependencies.workerId || workerId);
    if (!event) return null;
    return processEvent(event, { ...dependencies, repository: syncRepository });
  } finally {
    running = false;
  }
}

async function startWorker(dependencies = {}) {
  if (timer || String(process.env.IIG_INGESTION_SYNC_WORKER_ENABLED || 'false') !== 'true') return timer;
  const syncRepository = dependencies.repository || repository;
  const staleMs = positiveInteger(process.env.IIG_INGESTION_SYNC_STALE_MS, DEFAULT_STALE_MS, 30_000);
  await syncRepository.recoverStale(staleMs);
  const pollMs = positiveInteger(process.env.IIG_INGESTION_SYNC_POLL_MS, DEFAULT_POLL_MS, 250);
  timer = setInterval(() => runOnce({ ...dependencies, repository: syncRepository })
    .catch(error => console.error('[IigSourceSyncWorker]', error.message)), pollMs);
  timer.unref?.();
  await runOnce({ ...dependencies, repository: syncRepository });
  return timer;
}

function stopWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  positiveInteger,
  retryDelayMs,
  classifySyncError,
  processEvent,
  runOnce,
  startWorker,
  stopWorker,
};
