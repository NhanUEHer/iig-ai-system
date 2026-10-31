const { randomUUID } = require('node:crypto');
const repository = require('./answerTranscriptionRepository');
const answerSttClient = require('../../clients/iigAnswerSttClient');
const storageService = require('../../services/storageService');
const { buildAnswerSttInput } = require('./answerSttContract');
const { fingerprint } = require('./scoringPlan');

const DEFAULT_POLL_MS = 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_STALE_MS = 5 * 60 * 1000;
const DEFAULT_CONCURRENCY = 11;
const MAX_CONCURRENCY = 11;

function positiveInteger(value, fallback, minimum = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function boundedPositiveInteger(value, fallback, minimum = 1, maximum = MAX_CONCURRENCY) {
  return Math.min(maximum, positiveInteger(value, fallback, minimum));
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
    cause?.message || 'IIG answer transcription failed.',
    cause?.code || 'IIG_AI_ANSWER_STT_FAILED',
    true,
    cause
  );
}

function enabled(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function canonicalReference(task) {
  const provider = String(task.storageProvider || '').trim().toUpperCase();
  const key = String(task.storageKey || '').trim();
  if (!key) {
    throw workerError('Prepared student audio has no canonical storage key.', 'IIG_AI_STT_AUDIO_MISSING', false);
  }
  return provider === 'R2' ? `r2:${key}` : `local:${key}`;
}

async function resolveAudioUrl(task, storage, publicUrl) {
  const resolved = await storage.getSignedUrl(canonicalReference(task), {
    bucket: task.storageBucket,
  });
  if (/^https:\/\//i.test(resolved)) return resolved;
  if (!publicUrl) {
    throw workerError(
      'PUBLIC_URL is required for Dify to access locally stored student audio.',
      'IIG_AI_STT_PUBLIC_URL_REQUIRED',
      false
    );
  }
  const absolute = new URL(resolved, publicUrl).toString();
  if (!absolute.startsWith('https://')) {
    throw workerError('Answer STT audio must be exposed through HTTPS.', 'IIG_AI_STT_AUDIO_URL_INVALID', false);
  }
  return absolute;
}

function resolveConfig(overrides = {}, scorerType = '') {
  const config = {
    endpoint: String(
      overrides.endpoint ?? process.env.IIG_AI_ANSWER_STT_DIFY_ENDPOINT ?? ''
    ).trim(),
    apiKey: String(
      overrides.apiKey ?? process.env.IIG_AI_ANSWER_STT_DIFY_API_KEY ?? ''
    ).trim(),
    timeoutMs: positiveInteger(
      overrides.timeoutMs ?? process.env.IIG_AI_ANSWER_STT_TIMEOUT_MS,
      120_000,
      1000
    ),
    provider: String(overrides.provider ?? process.env.IIG_AI_ANSWER_STT_PROVIDER ?? 'DIFY')
      .trim().toUpperCase(),
    modelName: String(
      overrides.modelName ?? process.env.IIG_AI_ANSWER_STT_MODEL ?? 'gemini-3.8-flash'
    ).trim(),
    modelVersion: String(
      overrides.modelVersion ?? process.env.IIG_AI_ANSWER_STT_MODEL_VERSION ?? 'gemini-3.8-flash'
    ).trim(),
    promptVersion: String(
      overrides.promptVersion ?? process.env.IIG_AI_ANSWER_STT_PROMPT_VERSION ?? 'answer-stt-v1'
    ).trim(),
    featureVersion: String(
      overrides.featureVersion ?? process.env.IIG_AI_FEATURE_VERSION ?? 'iig-ai-evidence-v2'
    ).trim(),
    publicUrl: String(overrides.publicUrl ?? process.env.PUBLIC_URL ?? '').trim(),
  };
  if (!config.endpoint || !config.apiKey || !config.modelName || !config.modelVersion) {
    throw workerError(
      'Answer STT Dify endpoint, API key and model lineage must be configured.',
      'IIG_AI_STT_CONFIG_MISSING',
      false
    );
  }
  return config;
}

function requestFingerprint(task, input, config) {
  return fingerprint({
    schemaVersion: input.schema_version || input.schemaVersion,
    profile: input.stt_profile || input.profile,
    questionCode: input.question_code || input.questionCode,
    referenceText: input.reference_text || input.referenceText,
    questionText: input.question_text || input.questionText,
    contextText: input.context_text || input.contextText,
    audioChecksum: task.audioChecksum,
    provider: config.provider,
    modelName: config.modelName,
    modelVersion: config.modelVersion,
    promptVersion: config.promptVersion,
  });
}

function responseFingerprint(providerResult) {
  return fingerprint({
    providerRunId: providerResult.providerRunId,
    result: providerResult.result,
    rawOutput: providerResult.rawOutput || null,
  });
}

async function processEvent(event, dependencies = {}) {
  const taskRepository = dependencies.repository || repository;
  const storage = dependencies.storage || storageService;
  const maxAttempts = positiveInteger(
    dependencies.maxAttempts ?? process.env.IIG_AI_ANSWER_STT_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS
  );
  let task = null;
  let modelExecutionId = null;
  try {
    task = await taskRepository.loadTask(event);
    const config = resolveConfig(dependencies, task.scorerType);
    const audioUrl = await resolveAudioUrl(task, storage, config.publicUrl);
    const input = buildAnswerSttInput({
      aiInput: task.aiInput,
      questionCode: `S_Q${task.questionNumber}`,
      audioUrl,
    });
    const invokeProvider = () => {
      const client = dependencies.difyClient || dependencies.client || answerSttClient;
      return client.transcribe({
        endpoint: config.endpoint,
        apiKey: config.apiKey,
        timeoutMs: config.timeoutMs,
        input,
        requestId: modelExecutionId,
        modelVersion: config.modelVersion,
      });
    };
    const started = await taskRepository.startTask({
      event,
      task,
      config,
      requestHash: requestFingerprint(task, input, config),
    });
    if (!started.started) {
      return { status: 'skipped', runId: event.runId, reason: started.reason };
    }
    modelExecutionId = started.modelExecutionId;

    const providerResult = await invokeProvider();
    if (!providerResult.outcome.terminal) {
      throw workerError(
        `Answer STT provider returned retryable status ${providerResult.result.status}.`,
        'IIG_AI_STT_PROVIDER_REPORTED_FAILED',
        true
      );
    }
    const completed = await taskRepository.completeTask({
      event,
      task,
      modelExecutionId,
      providerResult,
      responseHash: responseFingerprint(providerResult),
      featureVersion: config.featureVersion,
    });
    return {
      status: completed.completed ? 'completed' : 'skipped',
      runId: event.runId,
      questionRunId: task.questionRunId,
      outputStatus: providerResult.result.status,
      questionStatus: completed.questionStatus,
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
const workerId = `iig-ai-answer-stt-${process.pid}-${randomUUID()}`;

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
    dependencies.concurrency ?? process.env.IIG_AI_ANSWER_STT_CONCURRENCY,
    DEFAULT_CONCURRENCY
  );
  const baseWorkerId = dependencies.workerId || workerId;
  const taskRepository = dependencies.repository || repository;
  try {
    const events = typeof taskRepository.claimBatchForNextSubmission === 'function'
      ? await taskRepository.claimBatchForNextSubmission(baseWorkerId, concurrency)
      : (await Promise.all(Array.from({ length: concurrency }, (_, index) =>
        taskRepository.claimNext(`${baseWorkerId}-${index + 1}`))))
        .filter(Boolean);
    return Promise.all(events.map(event => processEvent(event, {
      ...dependencies,
      repository: taskRepository,
    })));
  } finally {
    batchRunning = false;
  }
}

async function startWorker(dependencies = {}) {
  if (timer || !enabled(process.env.IIG_AI_ANSWER_STT_WORKER_ENABLED, false)) return timer;
  const taskRepository = dependencies.repository || repository;
  const staleMs = positiveInteger(
    dependencies.staleMs ?? process.env.IIG_AI_ANSWER_STT_STALE_MS,
    DEFAULT_STALE_MS,
    30_000
  );
  await taskRepository.recoverStale(staleMs);
  const pollMs = positiveInteger(
    dependencies.pollMs ?? process.env.IIG_AI_ANSWER_STT_POLL_MS,
    DEFAULT_POLL_MS,
    250
  );
  timer = setInterval(() => runBatch({ ...dependencies, repository: taskRepository })
    .catch(error => console.error('[IigAiAnswerSttWorker]', error.message)), pollMs);
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
  canonicalReference,
  resolveAudioUrl,
  resolveConfig,
  requestFingerprint,
  responseFingerprint,
  processEvent,
  runOnce,
  runBatch,
  startWorker,
  stopWorker,
};
