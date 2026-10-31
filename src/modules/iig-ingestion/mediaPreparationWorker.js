const { randomUUID } = require('node:crypto');
const repository = require('./mediaPreparationRepository');
const mediaProcessor = require('./mediaProcessor');
const { mediaFailureClassification } = require('./questionResolution');

const DEFAULT_POLL_MS = 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_STALE_MS = 15 * 60 * 1000;
// Media preparation is serialized per submission by runOnce(), while all media
// inside that submission may download/normalize in parallel up to this bound.
const DEFAULT_MEDIA_CONCURRENCY = 6;
const MAX_MEDIA_CONCURRENCY = 6;

function positiveInteger(value, fallback, minimum = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = positiveInteger(value, fallback, minimum);
  return Math.min(parsed, maximum);
}

async function mapWithConcurrency(items, concurrency, handler) {
  if (!items.length) return [];
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await handler(items[index], index);
    }
  }
  const workerCount = Math.min(concurrency, items.length);
  const settled = await Promise.allSettled(Array.from({ length: workerCount }, runWorker));
  const rejected = settled.find(result => result.status === 'rejected');
  if (rejected) throw rejected.reason;
  return results;
}

function retryDelayMs(attempt) {
  return Math.min(10 * 60 * 1000, 10_000 * (2 ** Math.max(0, attempt - 1)));
}

function classifyWorkerError(cause) {
  if (cause instanceof mediaProcessor.MediaProcessingError || cause?.retryable === false) return cause;
  return Object.assign(new Error(cause?.message || 'IIG media worker failed.'), {
    code: cause?.code || 'IIG_MEDIA_WORKER_FAILED',
    retryable: true,
    cause,
  });
}

function shouldRetryMediaError(error) {
  return Boolean(error?.retryable) || ['IIG_MEDIA_HTTP_401', 'IIG_MEDIA_HTTP_403'].includes(error?.code);
}

async function processEvent(event, dependencies = {}) {
  const deps = {
    repository: dependencies.repository || repository,
    processor: dependencies.processor || mediaProcessor,
    processorDependencies: dependencies.processorDependencies || {},
    maxAttempts: positiveInteger(
      dependencies.maxAttempts ?? process.env.IIG_INGESTION_MEDIA_MAX_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS
    ),
    concurrency: boundedInteger(
      dependencies.concurrency ?? process.env.IIG_INGESTION_MEDIA_CONCURRENCY,
      DEFAULT_MEDIA_CONCURRENCY,
      1,
      MAX_MEDIA_CONCURRENCY
    ),
  };
  try {
    const assets = await deps.repository.listPendingAssets(event.jobId);
    const outcomes = await mapWithConcurrency(assets, deps.concurrency, async asset => {
      await deps.repository.markAssetProcessing(asset.id);
      try {
        const result = await deps.processor.processAsset(asset, deps.processorDependencies);
        await deps.repository.markAssetResult(asset.id, result);
        return { type: result.status === 'INVALID_AUDIO' ? 'invalid' : 'processed', assetId: asset.id };
      } catch (cause) {
        const error = classifyWorkerError(cause);
        const shouldRetry = shouldRetryMediaError(error);
        if (shouldRetry && event.publishAttempts < deps.maxAttempts) {
          const classification = mediaFailureClassification(error);
          await deps.repository.markAssetRetry(asset.id, error, classification);
          return { type: 'retry', assetId: asset.id, error };
        }
        const classification = mediaFailureClassification(error, {
          retryExhausted: shouldRetry,
        });
        await deps.repository.markAssetFailure(asset.id, error, classification);
        return {
          type: classification.failureOrigin === 'SYSTEM' ? 'system_failed' : 'failed',
          assetId: asset.id,
          error,
        };
      }
    });
    const retry = outcomes.find(outcome => outcome.type === 'retry');
    if (retry) {
      const delayMs = retryDelayMs(event.publishAttempts);
      await deps.repository.markRetry({ event, error: retry.error, delayMs });
      return {
        status: 'retry', jobId: event.jobId, assetId: retry.assetId,
        code: retry.error.code, delayMs,
      };
    }
    const systemFailure = outcomes.find(outcome => outcome.type === 'system_failed');
    if (systemFailure) {
      await deps.repository.markDeadLetter({ event, error: systemFailure.error });
      return {
        status: 'dead_letter', jobId: event.jobId,
        assetId: systemFailure.assetId, code: systemFailure.error.code,
      };
    }
    const processed = outcomes.filter(outcome => outcome.type === 'processed').length;
    const invalid = outcomes.filter(outcome => outcome.type === 'invalid').length;
    const failed = outcomes.filter(outcome => outcome.type === 'failed').length;
    const summary = await deps.repository.completeMedia(event);
    return { status: 'completed', jobId: event.jobId, processed, invalid, failed, ...summary };
  } catch (cause) {
    const error = classifyWorkerError(cause);
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
const workerId = `media-preparation-${process.pid}-${randomUUID()}`;

async function runOnce(dependencies = {}) {
  if (running) return null;
  running = true;
  const mediaRepository = dependencies.repository || repository;
  try {
    const event = await mediaRepository.claimNext(dependencies.workerId || workerId);
    if (!event) return null;
    return processEvent(event, { ...dependencies, repository: mediaRepository });
  } finally {
    running = false;
  }
}

async function startWorker(dependencies = {}) {
  if (timer || String(process.env.IIG_INGESTION_MEDIA_WORKER_ENABLED || 'false') !== 'true') return timer;
  const mediaRepository = dependencies.repository || repository;
  const staleMs = positiveInteger(process.env.IIG_INGESTION_MEDIA_STALE_MS, DEFAULT_STALE_MS, 60_000);
  await mediaRepository.recoverStale(staleMs);
  const pollMs = positiveInteger(process.env.IIG_INGESTION_MEDIA_POLL_MS, DEFAULT_POLL_MS, 250);
  timer = setInterval(() => runOnce({ ...dependencies, repository: mediaRepository })
    .catch(error => console.error('[IigMediaPreparationWorker]', error.message)), pollMs);
  timer.unref?.();
  await runOnce({ ...dependencies, repository: mediaRepository });
  return timer;
}

function stopWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  positiveInteger,
  boundedInteger,
  mapWithConcurrency,
  retryDelayMs,
  classifyWorkerError,
  shouldRetryMediaError,
  processEvent,
  runOnce,
  startWorker,
  stopWorker,
};
