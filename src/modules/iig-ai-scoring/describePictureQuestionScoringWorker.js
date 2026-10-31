const { randomUUID } = require('node:crypto');
const repository = require('./describePictureQuestionScoringRepository');
const difyClient = require('../../clients/iigDescribePictureDifyClient');
const storageService = require('../../services/storageService');
const { fingerprint } = require('./scoringPlan');

const DEFAULT_POLL_MS = 1000;
const DEFAULT_STALE_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_CONCURRENCY = 8;
const MAX_CONCURRENCY = 32;

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

function workerError(message, code, retryable, cause) {
  return Object.assign(new Error(message), { code, retryable, cause });
}

function classifyError(cause) {
  if (cause?.retryable === false) return cause;
  return workerError(
    cause?.message || 'IIG Describe Picture question scoring failed.',
    cause?.code || 'IIG_AI_DESCRIBE_PICTURE_QUESTION_SCORING_FAILED',
    true,
    cause
  );
}

function resolveConfig(overrides = {}) {
  const config = {
    endpoint: String(overrides.endpoint ?? process.env.IIG_AI_DESCRIBE_PICTURE_DIFY_ENDPOINT ?? '').trim(),
    apiKey: String(overrides.apiKey ?? process.env.IIG_AI_DESCRIBE_PICTURE_DIFY_API_KEY ?? '').trim(),
    timeoutMs: positiveInteger(
      overrides.timeoutMs ?? process.env.IIG_AI_DESCRIBE_PICTURE_DIFY_TIMEOUT_MS,
      180_000,
      1000
    ),
    publicUrl: String(overrides.publicUrl ?? process.env.PUBLIC_URL ?? '').trim(),
    provider: 'DIFY',
    modelName: String(
      overrides.modelName ?? process.env.IIG_AI_DESCRIBE_PICTURE_DIFY_MODEL ?? 'gemini-3.8-flash'
    ).trim(),
    modelVersion: String(
      overrides.modelVersion ?? process.env.IIG_AI_DESCRIBE_PICTURE_DIFY_MODEL_VERSION ?? 'gemini-3.8-flash'
    ).trim(),
    promptVersion: String(
      overrides.promptVersion ?? process.env.IIG_AI_DESCRIBE_PICTURE_DIFY_PROMPT_VERSION ?? 'describe-picture-question-flow-v2'
    ).trim(),
  };
  if (!config.endpoint || !config.apiKey || !config.modelName || !config.modelVersion
      || !config.promptVersion) {
    throw workerError(
      'Describe Picture Dify endpoint, API key and model lineage must be configured.',
      'IIG_AI_DESCRIBE_PICTURE_DIFY_CONFIG_MISSING',
      false
    );
  }
  return config;
}

function canonicalReference(task, asset = 'audio') {
  const prefix = asset === 'image' ? 'image' : 'audio';
  const provider = String(task[`${prefix}StorageProvider`] || '').trim().toUpperCase();
  const key = String(task[`${prefix}StorageKey`] || '').trim();
  if (!key) {
    throw workerError(
      `Describe Picture ${asset} has no canonical storage key.`,
      `IIG_AI_DESCRIBE_PICTURE_${asset.toUpperCase()}_MISSING`,
      false
    );
  }
  return provider === 'R2' ? `r2:${key}` : `local:${key}`;
}

async function resolveAssetUrl(task, storage, publicUrl, asset) {
  const prefix = asset === 'image' ? 'image' : 'audio';
  const url = await storage.getSignedUrl(canonicalReference(task, asset), {
    bucket: task[`${prefix}StorageBucket`],
  });
  if (/^https:\/\//i.test(url)) return url;
  if (!publicUrl) {
    throw workerError(
      `PUBLIC_URL is required for Dify to access locally stored Describe Picture ${asset}.`,
      'IIG_AI_DESCRIBE_PICTURE_PUBLIC_URL_REQUIRED',
      false
    );
  }
  const absolute = new URL(url, publicUrl).toString();
  if (!absolute.startsWith('https://')) {
    throw workerError(
      `Describe Picture ${asset} must be exposed through HTTPS.`,
      `IIG_AI_DESCRIBE_PICTURE_${asset.toUpperCase()}_URL_INVALID`,
      false
    );
  }
  return absolute;
}

function resolveAudioUrl(task, storage, publicUrl) {
  return resolveAssetUrl(task, storage, publicUrl, 'audio');
}

function resolveImageUrl(task, storage, publicUrl) {
  return resolveAssetUrl(task, storage, publicUrl, 'image');
}

function buildProviderInput(task, audioUrl, imageUrl) {
  const questionId = `s_q${task.questionNumber}`;
  const promptText = String(
    task.aiInput?.question?.questionText || task.aiInput?.question?.promptText || ''
  ).normalize('NFKC').trim();
  const transcript = String(task.transcript || '').normalize('NFKC').trim();
  const scoringDisposition = String(task.scoringDisposition || 'NORMAL').trim().toUpperCase();
  const zeroReason = String(task.zeroReason || task.upstreamZeroReason || 'NONE').trim().toUpperCase();
  const zeroOrigin = String(task.zeroOrigin || 'NONE').trim().toUpperCase();
  const upstreamZeroReason = String(task.upstreamZeroReason || zeroReason || 'NONE').trim().toUpperCase();
  if (!['s_q3', 's_q4'].includes(questionId)
      || (scoringDisposition === 'NORMAL' && (!transcript || !audioUrl || !imageUrl))) {
    throw workerError(
      'Describe Picture Dify scoring requires Q3/Q4, transcript, audio and prompt image.',
      'IIG_AI_DESCRIBE_PICTURE_SCORING_INPUT_INVALID',
      false
    );
  }
  return {
    jobId: task.runId,
    keycode: task.keycode,
    questionId,
    promptText,
    transcript,
    audioUrl,
    imageUrl,
    upstreamZeroReason,
    scoringDisposition,
    zeroReason,
    zeroOrigin,
    resolutionMetadata: task.resolutionMetadata || {},
  };
}

function requestFingerprint(task, config) {
  return fingerprint({
    schemaVersion: 'describe-picture-question-input-v1',
    questionRunId: task.questionRunId,
    inputFingerprint: task.inputFingerprint,
    featureSetId: task.featureSetId,
    audioChecksum: task.audioChecksum,
    imageChecksum: task.imageChecksum,
    transcript: task.transcript,
    promptText: task.aiInput?.question?.questionText
      || task.aiInput?.question?.promptText
      || null,
    scoringDisposition: task.scoringDisposition || 'NORMAL',
    zeroReason: task.zeroReason || null,
    zeroOrigin: task.zeroOrigin || null,
    resolutionMetadata: task.resolutionMetadata || {},
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
  const storage = dependencies.storage || storageService;
  const client = dependencies.client || difyClient;
  const maxAttempts = positiveInteger(
    dependencies.maxAttempts ?? process.env.IIG_AI_DESCRIBE_PICTURE_SCORING_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS
  );
  let task = null;
  let modelExecutionId = null;
  try {
    const config = resolveConfig(dependencies);
    task = await taskRepository.loadTask(event);
    const isDeterministicResolution = String(task.scoringDisposition || 'NORMAL').toUpperCase() !== 'NORMAL'
      || String(task.upstreamZeroReason || 'NONE').toUpperCase() !== 'NONE';
    const audioUrl = isDeterministicResolution ? null : await resolveAudioUrl(task, storage, config.publicUrl);
    const imageUrl = isDeterministicResolution ? null : await resolveImageUrl(task, storage, config.publicUrl);
    const input = buildProviderInput(task, audioUrl, imageUrl);
    const started = await taskRepository.startTask({
      event,
      task,
      lineage: config,
      requestHash: requestFingerprint(task, config),
    });
    if (!started.started) {
      return { status: 'skipped', runId: event.runId, reason: started.reason };
    }
    modelExecutionId = started.modelExecutionId;
    const providerResult = await client.score({
      endpoint: config.endpoint,
      apiKey: config.apiKey,
      timeoutMs: config.timeoutMs,
      input,
      requestId: modelExecutionId,
      onProgress: progress => taskRepository.recordProgress({ event, task, progress }),
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
      questionRunId: task.questionRunId,
      questionScore: providerResult.result.questionScoreRounded,
      groupEvents: completed.groupEvents || 0,
      reason: completed.reason,
    };
  } catch (cause) {
    const error = classifyError(cause);
    if (error.retryable && event.publishAttempts < maxAttempts) {
      const delayMs = retryDelayMs(event.publishAttempts);
      await taskRepository.markRetry({
        event,
        task,
        modelExecutionId,
        error,
        delayMs,
        attempt: event.publishAttempts,
        maxAttempts,
      });
      return {
        status: 'retry',
        runId: event.runId,
        code: error.code,
        delayMs,
        attempt: event.publishAttempts,
        nextAttempt: event.publishAttempts + 1,
        maxAttempts,
      };
    }
    await taskRepository.markDeadLetter({ event, task, modelExecutionId, error });
    return {
      status: 'dead_letter',
      runId: event.runId,
      code: error.code,
      attempt: event.publishAttempts,
      maxAttempts,
      retryExhausted: Boolean(error.retryable),
    };
  }
}

let timer = null;
let batchRunning = false;
const workerId = `iig-ai-describe-picture-question-scoring-${process.pid}-${randomUUID()}`;

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
    dependencies.concurrency ?? process.env.IIG_AI_DESCRIBE_PICTURE_SCORING_CONCURRENCY,
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
  if (timer || !enabled(process.env.IIG_AI_DESCRIBE_PICTURE_SCORING_WORKER_ENABLED, false)) return timer;
  const taskRepository = dependencies.repository || repository;
  const staleMs = positiveInteger(
    dependencies.staleMs ?? process.env.IIG_AI_DESCRIBE_PICTURE_SCORING_STALE_MS,
    DEFAULT_STALE_MS,
    30_000
  );
  await taskRepository.recoverStale(staleMs);
  const pollMs = positiveInteger(
    dependencies.pollMs ?? process.env.IIG_AI_DESCRIBE_PICTURE_SCORING_POLL_MS,
    DEFAULT_POLL_MS,
    250
  );
  timer = setInterval(() => runBatch({ ...dependencies, repository: taskRepository })
    .catch(error => console.error('[IigAiDescribePictureQuestionScoringWorker]', error.message)), pollMs);
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
  canonicalReference,
  resolveAssetUrl,
  resolveAudioUrl,
  resolveImageUrl,
  buildProviderInput,
  requestFingerprint,
  responseFingerprint,
  processEvent,
  runOnce,
  runBatch,
  startWorker,
  stopWorker,
};
