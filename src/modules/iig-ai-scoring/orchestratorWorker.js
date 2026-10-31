const { randomUUID } = require('node:crypto');
const repository = require('./orchestratorRepository');

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
  return Object.assign(new Error(cause?.message || 'IIG AI scoring dispatch failed.'), {
    code: cause?.code || 'IIG_AI_SCORING_DISPATCH_FAILED',
    retryable: true,
    cause,
  });
}

function resolveConfig(overrides = {}) {
  const sttConfig = {
    provider: String(overrides.sttProvider ?? process.env.IIG_AI_ANSWER_STT_PROVIDER ?? 'DIFY').trim().toUpperCase(),
    modelName: String(
      overrides.sttModelName ?? process.env.IIG_AI_ANSWER_STT_MODEL ?? 'gemini-3.8-flash'
    ).trim(),
    modelVersion: String(
      overrides.sttModelVersion ?? process.env.IIG_AI_ANSWER_STT_MODEL_VERSION ?? 'gemini-3.8-flash'
    ).trim(),
    promptVersion: String(overrides.sttPromptVersion ?? process.env.IIG_AI_ANSWER_STT_PROMPT_VERSION ?? 'rta-answer-stt-v1').trim(),
  };
  if (!sttConfig.modelName || !sttConfig.modelVersion) {
    throw Object.assign(new Error('Answer STT model name and version must be configured.'), {
      code: 'IIG_AI_STT_CONFIG_MISSING',
      retryable: false,
    });
  }
  return {
    sttConfig,
    rtaSttConfig: sttConfig,
    featureVersion: String(
      overrides.featureVersion ?? process.env.IIG_AI_FEATURE_VERSION ?? 'iig-ai-evidence-v2'
    ).trim(),
  };
}

async function processEvent(event, dependencies = {}) {
  const taskRepository = dependencies.repository || repository;
  const maxAttempts = positiveInteger(
    dependencies.maxAttempts ?? process.env.IIG_AI_ORCHESTRATOR_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS
  );
  try {
    const config = resolveConfig(dependencies);
    const result = await taskRepository.dispatchRun({ event, ...config });
    return { status: result.dispatched ? 'completed' : 'skipped', runId: event.runId, ...result };
  } catch (cause) {
    const error = classifyError(cause);
    if (error.retryable && event.publishAttempts < maxAttempts) {
      const delayMs = retryDelayMs(event.publishAttempts);
      await taskRepository.markRetry({ event, error, delayMs });
      return { status: 'retry', runId: event.runId, code: error.code, delayMs };
    }
    await taskRepository.markDeadLetter({ event, error });
    return { status: 'dead_letter', runId: event.runId, code: error.code };
  }
}

let timer = null;
let running = false;
const workerId = `iig-ai-orchestrator-${process.pid}-${randomUUID()}`;

async function runOnce(dependencies = {}) {
  if (running) return null;
  running = true;
  const taskRepository = dependencies.repository || repository;
  try {
    const event = await taskRepository.claimNext(dependencies.workerId || workerId);
    if (!event) return null;
    return processEvent(event, { ...dependencies, repository: taskRepository });
  } finally {
    running = false;
  }
}

async function startWorker(dependencies = {}) {
  if (timer || String(process.env.IIG_AI_ORCHESTRATOR_WORKER_ENABLED || 'false') !== 'true') return timer;
  const taskRepository = dependencies.repository || repository;
  const staleMs = positiveInteger(
    dependencies.staleMs ?? process.env.IIG_AI_ORCHESTRATOR_STALE_MS,
    DEFAULT_STALE_MS,
    30_000
  );
  await taskRepository.recoverStale(staleMs);
  const pollMs = positiveInteger(
    dependencies.pollMs ?? process.env.IIG_AI_ORCHESTRATOR_POLL_MS,
    DEFAULT_POLL_MS,
    250
  );
  timer = setInterval(() => runOnce({ ...dependencies, repository: taskRepository })
    .catch(error => console.error('[IigAiScoringOrchestrator]', error.message)), pollMs);
  timer.unref?.();
  await runOnce({ ...dependencies, repository: taskRepository });
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
  resolveConfig,
  processEvent,
  runOnce,
  startWorker,
  stopWorker,
};
