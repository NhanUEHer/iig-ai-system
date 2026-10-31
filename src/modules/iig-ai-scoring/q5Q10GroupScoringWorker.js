const { randomUUID } = require('node:crypto');
const repository = require('./q5Q10GroupScoringRepository');
const difyClient = require('../../clients/iigQ5Q10GroupDifyClient');
const { fingerprint } = require('./scoringPlan');

const DEFAULT_POLL_MS = 1000;
const DEFAULT_STALE_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 16;
const EXPECTED_QUESTION_IDS = Object.freeze(
  [5, 6, 7, 8, 9, 10].map(number => `s_q${number}`)
);

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
  return Object.assign(new Error(cause?.message || 'IIG Q5-Q10 group scoring failed.'), {
    code: cause?.code || 'IIG_AI_Q5_Q10_GROUP_SCORING_FAILED',
    retryable: true,
    cause,
  });
}

function resolveConfig(overrides = {}) {
  const config = {
    endpoint: String(overrides.endpoint ?? process.env.IIG_AI_Q5_Q10_GROUP_DIFY_ENDPOINT ?? '').trim(),
    apiKey: String(overrides.apiKey ?? process.env.IIG_AI_Q5_Q10_GROUP_DIFY_API_KEY ?? '').trim(),
    timeoutMs: positiveInteger(
      overrides.timeoutMs ?? process.env.IIG_AI_Q5_Q10_GROUP_DIFY_TIMEOUT_MS,
      120_000,
      1000
    ),
    provider: 'DIFY',
    modelName: String(
      overrides.modelName ?? process.env.IIG_AI_Q5_Q10_GROUP_DIFY_MODEL ?? 'gemini-3.8-flash'
    ).trim(),
    modelVersion: String(
      overrides.modelVersion
        ?? process.env.IIG_AI_Q5_Q10_GROUP_DIFY_MODEL_VERSION
        ?? 'gemini-3.8-flash'
    ).trim(),
    promptVersion: String(
      overrides.promptVersion
        ?? process.env.IIG_AI_Q5_Q10_GROUP_DIFY_PROMPT_VERSION
        ?? 'respond-q5-q10-group-prompt-v2'
    ).trim(),
  };
  if (!config.endpoint || !config.apiKey || !config.modelName || !config.modelVersion
      || !config.promptVersion) {
    throw Object.assign(new Error(
      'Q5-Q10 group Dify endpoint, API key and model lineage must be configured.'
    ), {
      code: 'IIG_AI_Q5_Q10_GROUP_DIFY_CONFIG_MISSING',
      retryable: false,
    });
  }
  return config;
}

function buildProviderInput(task) {
  return {
    jobId: task.runId,
    keycode: task.keycode,
    questionScores: task.questionScores,
  };
}

function missingQuestionIds(questionScores) {
  const available = new Set(Object.keys(questionScores || {}));
  return EXPECTED_QUESTION_IDS.filter(questionId => !available.has(questionId));
}

function requestFingerprint(task, config) {
  return fingerprint({
    schemaVersion: 'respond-q5-q10-group-input-v1',
    groupResultId: task.groupResultId,
    aggregationVersion: task.aggregationVersion,
    questionScores: task.questionScores,
    provider: config.provider,
    modelName: config.modelName,
    modelVersion: config.modelVersion,
    promptVersion: config.promptVersion,
  });
}

function responseFingerprint(providerResult) {
  return fingerprint({
    providerRunId: providerResult.providerRunId,
    workflowStatus: providerResult.workflowStatus,
    result: providerResult.result,
  });
}

async function processEvent(event, dependencies = {}) {
  const taskRepository = dependencies.repository || repository;
  const client = dependencies.client || difyClient;
  const maxAttempts = positiveInteger(
    dependencies.maxAttempts ?? process.env.IIG_AI_Q5_Q10_GROUP_SCORING_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS
  );
  let task = null;
  let modelExecutionId = null;
  try {
    task = await taskRepository.loadTask(event);
    const missing = missingQuestionIds(task.questionScores);
    if (missing.length) {
      const unavailable = new Set(task.unavailableQuestionIds || []);
      if (!missing.every(questionId => unavailable.has(questionId))) {
        throw Object.assign(new Error(
          'Q5-Q10 group is missing question scores without a source-data resolution.'
        ), {
          code: 'IIG_AI_Q5_Q10_GROUP_INPUT_INVALID',
          retryable: false,
        });
      }
      const skipped = await taskRepository.skipIncompleteGroup({
        event,
        task,
        missingQuestionIds: missing,
      });
      return {
        status: skipped.completed ? 'skipped' : 'busy',
        runId: event.runId,
        groupResultId: task.groupResultId,
        reason: skipped.reason || 'SOURCE_QUESTIONS_UNAVAILABLE',
        missingQuestionIds: missing,
      };
    }
    const config = resolveConfig(dependencies);
    const started = await taskRepository.startTask({
      event,
      task,
      lineage: config,
      requestHash: requestFingerprint(task, config),
    });
    if (!started.started) return { status: 'skipped', runId: event.runId, reason: started.reason };
    modelExecutionId = started.modelExecutionId;
    const providerResult = await client.score({
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      timeoutMs: config.timeoutMs,
      input: buildProviderInput(task),
      requestId: modelExecutionId,
    });
    const completed = await taskRepository.completeTask({
      event,
      task,
      modelExecutionId,
      providerResult,
      responseHash: responseFingerprint(providerResult),
    });
    return {
      status: completed.completed ? 'completed' : 'skipped',
      runId: event.runId,
      groupResultId: task.groupResultId,
      groupFinalScore: providerResult.result.groupFinalScore,
      reason: completed.reason,
    };
  } catch (cause) {
    const error = classifyError(cause);
    if (error.retryable && event.publishAttempts < maxAttempts) {
      const delayMs = retryDelayMs(event.publishAttempts);
      await taskRepository.markRetry({ event, task, modelExecutionId, error, delayMs });
      return { status: 'retry', runId: event.runId, code: error.code, delayMs };
    }
    await taskRepository.markDeadLetter({ event, task, modelExecutionId, error });
    return { status: 'dead_letter', runId: event.runId, code: error.code };
  }
}

let timer = null;
let batchRunning = false;
const workerId = `iig-ai-q5-q10-group-scoring-${process.pid}-${randomUUID()}`;

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
    dependencies.concurrency ?? process.env.IIG_AI_Q5_Q10_GROUP_SCORING_CONCURRENCY,
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
  if (timer || !enabled(process.env.IIG_AI_Q5_Q10_GROUP_SCORING_WORKER_ENABLED, false)) return timer;
  const taskRepository = dependencies.repository || repository;
  const staleMs = positiveInteger(
    dependencies.staleMs ?? process.env.IIG_AI_Q5_Q10_GROUP_SCORING_STALE_MS,
    DEFAULT_STALE_MS,
    30_000
  );
  await taskRepository.recoverStale(staleMs);
  const pollMs = positiveInteger(
    dependencies.pollMs ?? process.env.IIG_AI_Q5_Q10_GROUP_SCORING_POLL_MS,
    DEFAULT_POLL_MS,
    250
  );
  timer = setInterval(() => runBatch({ ...dependencies, repository: taskRepository })
    .catch(error => console.error('[IigAiQ5Q10GroupScoringWorker]', error.message)), pollMs);
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
  buildProviderInput,
  missingQuestionIds,
  requestFingerprint,
  responseFingerprint,
  processEvent,
  runOnce,
  runBatch,
  startWorker,
  stopWorker,
};
