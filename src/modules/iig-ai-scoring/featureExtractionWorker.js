const { randomUUID } = require('node:crypto');
const repository = require('./featureExtractionRepository');
const { extractFeatures } = require('./featureExtractor');

const DEFAULT_POLL_MS = 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_STALE_MS = 5 * 60 * 1000;
const DEFAULT_CONCURRENCY = 16;
const MAX_CONCURRENCY = 64;

function positiveInteger(value, fallback, minimum = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function boundedPositiveInteger(value, fallback, minimum = 1, maximum = MAX_CONCURRENCY) {
  return Math.min(maximum, positiveInteger(value, fallback, minimum));
}

function enabled(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function retryDelayMs(attempt) {
  return Math.min(5 * 60 * 1000, 5000 * (2 ** Math.max(0, attempt - 1)));
}

function classifyError(cause) {
  if (cause?.retryable === false) return cause;
  return Object.assign(new Error(cause?.message || 'IIG feature extraction failed.'), {
    code: cause?.code || 'IIG_AI_FEATURE_EXTRACTION_FAILED',
    retryable: true,
    cause,
  });
}

function resolveConfig(overrides = {}) {
  const featureVersion = String(
    overrides.featureVersion ?? process.env.IIG_AI_FEATURE_VERSION ?? 'iig-ai-evidence-v2'
  ).trim();
  if (!featureVersion) {
    throw Object.assign(new Error('Feature version must be configured.'), {
      code: 'IIG_AI_FEATURE_VERSION_MISSING',
      retryable: false,
    });
  }
  return { featureVersion };
}

async function processEvent(event, dependencies = {}) {
  const taskRepository = dependencies.repository || repository;
  const extractor = dependencies.extractor || extractFeatures;
  const maxAttempts = positiveInteger(
    dependencies.maxAttempts ?? process.env.IIG_AI_FEATURE_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS
  );
  let task = null;
  try {
    const config = resolveConfig(dependencies);
    const requestedFeatureVersion = String(event.payload?.featureVersion || '').trim();
    if (!requestedFeatureVersion || requestedFeatureVersion !== config.featureVersion) {
      throw Object.assign(new Error(
        `Feature event version ${requestedFeatureVersion || '(empty)'} does not match active version ${config.featureVersion}.`
      ), {
        code: 'IIG_AI_FEATURE_VERSION_MISMATCH',
        retryable: false,
      });
    }
    task = await taskRepository.loadTask(event);
    const extracted = extractor({
      aiInput: task.aiInput,
      transcript: task.transcript,
      featureVersion: config.featureVersion,
    });
    const completed = await taskRepository.completeTask({
      event,
      task,
      extracted,
      featureVersion: config.featureVersion,
    });
    return {
      status: completed.completed ? 'completed' : 'skipped',
      runId: event.runId,
      questionRunId: task.questionRunId,
      featureSetId: completed.featureSetId,
      pendingStages: completed.pendingStages || [],
      reason: completed.reason,
    };
  } catch (cause) {
    const error = classifyError(cause);
    if (error.retryable && event.publishAttempts < maxAttempts) {
      const delayMs = retryDelayMs(event.publishAttempts);
      await taskRepository.markRetry({ event, task, error, delayMs });
      return { status: 'retry', runId: event.runId, code: error.code, delayMs };
    }
    await taskRepository.markDeadLetter({ event, task, error });
    return { status: 'dead_letter', runId: event.runId, code: error.code };
  }
}

let timer = null;
let batchRunning = false;
const workerId = `iig-ai-feature-extraction-${process.pid}-${randomUUID()}`;

async function runOnce(dependencies = {}) {
  const taskRepository = dependencies.repository || repository;
  const event = await taskRepository.claimNext(dependencies.workerId || workerId);
  if (!event) return null;
  return processEvent(event, { ...dependencies, repository: taskRepository });
}

async function runBatch(dependencies = {}) {
  if (batchRunning) return [];
  batchRunning = true;
  const concurrency = boundedPositiveInteger(
    dependencies.concurrency ?? process.env.IIG_AI_FEATURE_CONCURRENCY,
    DEFAULT_CONCURRENCY
  );
  const baseWorkerId = dependencies.workerId || workerId;
  try {
    return Promise.all(Array.from({ length: concurrency }, (_, index) => runOnce({
      ...dependencies,
      workerId: `${baseWorkerId}-${index + 1}`,
    })));
  } finally {
    batchRunning = false;
  }
}

async function startWorker(dependencies = {}) {
  if (timer || !enabled(process.env.IIG_AI_FEATURE_WORKER_ENABLED, false)) return timer;
  const taskRepository = dependencies.repository || repository;
  const staleMs = positiveInteger(
    dependencies.staleMs ?? process.env.IIG_AI_FEATURE_STALE_MS,
    DEFAULT_STALE_MS,
    30_000
  );
  await taskRepository.recoverStale(staleMs);
  const pollMs = positiveInteger(
    dependencies.pollMs ?? process.env.IIG_AI_FEATURE_POLL_MS,
    DEFAULT_POLL_MS,
    250
  );
  timer = setInterval(() => runBatch({ ...dependencies, repository: taskRepository })
    .catch(error => console.error('[IigAiFeatureExtractionWorker]', error.message)), pollMs);
  timer.unref?.();
  await runBatch({ ...dependencies, repository: taskRepository });
  return timer;
}

function stopWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  positiveInteger,
  boundedPositiveInteger,
  retryDelayMs,
  classifyError,
  resolveConfig,
  processEvent,
  runOnce,
  runBatch,
  startWorker,
  stopWorker,
};
