const { randomUUID } = require('node:crypto');
const iigClient = require('../../clients/iigClient');
const repository = require('./sourceFetchRepository');
const { validateBatchDetail, classifySourceError } = require('./sourcePayloadValidator');

const DEFAULT_POLL_MS = 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_STALE_MS = 5 * 60 * 1000;
const DEFAULT_SNAPSHOT_DAYS = 7;

function positiveInteger(value, fallback, minimum = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function retryDelayMs(attempt) {
  return Math.min(5 * 60 * 1000, 5000 * (2 ** Math.max(0, attempt - 1)));
}

async function fetchBatchDetail(job, dependencies) {
  return dependencies.iigClient.fetchMocktestScoringBatchDetail(job.source_scoring_id);
}

async function processEvent(event, dependencies = {}) {
  const deps = {
    repository: dependencies.repository || repository,
    iigClient: dependencies.iigClient || iigClient,
    maxAttempts: positiveInteger(
      dependencies.maxAttempts ?? process.env.IIG_INGESTION_SOURCE_MAX_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS
    ),
    snapshotDays: positiveInteger(
      dependencies.snapshotDays ?? process.env.IIG_INGESTION_SOURCE_SNAPSHOT_DAYS,
      DEFAULT_SNAPSHOT_DAYS
    ),
  };
  const job = await deps.repository.findJob(event.jobId);
  if (!job) {
    const error = Object.assign(new Error('The ingestion job no longer exists.'), {
      code: 'SCORING_JOB_NOT_FOUND', retryable: false,
    });
    await deps.repository.markDeadLetter({ event, jobId: event.jobId, error });
    return { status: 'dead_letter', code: error.code };
  }

  await deps.repository.markFetching(job.id);
  try {
    const response = await fetchBatchDetail(job, deps);
    const normalized = validateBatchDetail(response, {
      scoringId: String(job.source_scoring_id),
      keycode: job.keycode,
    });
    await deps.repository.completeFetch({ event, job, normalized, snapshotDays: deps.snapshotDays });
    return { status: 'completed', jobId: job.id, questionCount: normalized.questionCount };
  } catch (cause) {
    const error = classifySourceError(cause);
    if (error.retryable && event.publishAttempts < deps.maxAttempts) {
      const delayMs = retryDelayMs(event.publishAttempts);
      await deps.repository.markRetry({ event, jobId: job.id, error, delayMs });
      return { status: 'retry', jobId: job.id, code: error.code, delayMs };
    }
    await deps.repository.markDeadLetter({ event, jobId: job.id, error });
    return { status: 'dead_letter', jobId: job.id, code: error.code };
  }
}

let timer = null;
let running = false;
const workerId = `source-fetch-${process.pid}-${randomUUID()}`;

async function runOnce(dependencies = {}) {
  if (running) return null;
  running = true;
  const sourceRepository = dependencies.repository || repository;
  try {
    const event = await sourceRepository.claimNext(dependencies.workerId || workerId);
    if (!event) return null;
    return await processEvent(event, { ...dependencies, repository: sourceRepository });
  } finally {
    running = false;
  }
}

async function startWorker(dependencies = {}) {
  if (timer || String(process.env.IIG_INGESTION_SOURCE_WORKER_ENABLED || 'false') !== 'true') return timer;
  const sourceRepository = dependencies.repository || repository;
  const staleMs = positiveInteger(
    process.env.IIG_INGESTION_SOURCE_STALE_MS,
    DEFAULT_STALE_MS,
    30_000
  );
  await sourceRepository.recoverStale(staleMs);
  const pollMs = positiveInteger(
    process.env.IIG_INGESTION_SOURCE_POLL_MS,
    DEFAULT_POLL_MS,
    250
  );
  timer = setInterval(() => runOnce({ ...dependencies, repository: sourceRepository })
    .catch(error => console.error('[IigSourceFetchWorker]', error.message)), pollMs);
  timer.unref?.();
  await runOnce({ ...dependencies, repository: sourceRepository });
  return timer;
}

function stopWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  retryDelayMs,
  positiveInteger,
  fetchBatchDetail,
  processEvent,
  runOnce,
  startWorker,
  stopWorker,
};
