const { randomUUID } = require('node:crypto');
const repository = require('./inputValidationRepository');
const { validateAttempt } = require('./inputValidator');

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

function classifyError(cause) {
  if (cause?.retryable === false) return cause;
  return Object.assign(new Error(cause?.message || 'IIG input validation failed.'), {
    code: cause?.code || 'IIG_INPUT_VALIDATION_FAILED',
    retryable: true,
    cause,
  });
}

async function processEvent(event, dependencies = {}) {
  const deps = {
    repository: dependencies.repository || repository,
    maxAttempts: positiveInteger(
      dependencies.maxAttempts ?? process.env.IIG_INGESTION_VALIDATION_MAX_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS
    ),
  };
  try {
    const attempts = await deps.repository.loadAttempts(event.jobId);
    if (!attempts.length) {
      throw Object.assign(new Error('No question attempts are available for validation.'), {
        code: 'IIG_ATTEMPTS_MISSING', retryable: false,
      });
    }
    const results = attempts.map(validateAttempt);
    const summary = await deps.repository.completeValidation({ event, results });
    return {
      status: 'completed',
      jobId: event.jobId,
      submissionId: summary.submissionId,
      jobStatus: summary.status,
      readyQuestions: summary.readyQuestions,
      invalidQuestions: summary.invalidQuestions,
      scoringGroupsRequested: summary.scoringGroups || [],
    };
  } catch (cause) {
    const error = classifyError(cause);
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
const workerId = `input-validation-${process.pid}-${randomUUID()}`;

async function runOnce(dependencies = {}) {
  if (running) return null;
  running = true;
  const validationRepository = dependencies.repository || repository;
  try {
    const event = await validationRepository.claimNext(dependencies.workerId || workerId);
    if (!event) return null;
    return processEvent(event, { ...dependencies, repository: validationRepository });
  } finally {
    running = false;
  }
}

async function startWorker(dependencies = {}) {
  if (timer || String(process.env.IIG_INGESTION_VALIDATION_WORKER_ENABLED || 'false') !== 'true') return timer;
  const validationRepository = dependencies.repository || repository;
  const staleMs = positiveInteger(process.env.IIG_INGESTION_VALIDATION_STALE_MS, DEFAULT_STALE_MS, 30_000);
  await validationRepository.recoverStale(staleMs);
  await validationRepository.enqueueResolutionReconciliation?.();
  const pollMs = positiveInteger(process.env.IIG_INGESTION_VALIDATION_POLL_MS, DEFAULT_POLL_MS, 250);
  timer = setInterval(() => runOnce({ ...dependencies, repository: validationRepository })
    .catch(error => console.error('[IigInputValidationWorker]', error.message)), pollMs);
  timer.unref?.();
  await runOnce({ ...dependencies, repository: validationRepository });
  return timer;
}

function stopWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  positiveInteger,
  retryDelayMs,
  classifyError,
  processEvent,
  runOnce,
  startWorker,
  stopWorker,
};
