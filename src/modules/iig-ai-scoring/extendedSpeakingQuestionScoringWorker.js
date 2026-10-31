const { randomUUID } = require('node:crypto');
const repository = require('./extendedSpeakingQuestionScoringRepository');
const difyClient = require('../../clients/iigExtendedSpeakingDifyClient');
const storageService = require('../../services/storageService');
const { fingerprint } = require('./scoringPlan');
const {
  profileForScorerType,
  responseProfile,
  validateQuestion,
} = require('./extendedSpeakingProfiles');

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

function inferLegacyResolution(reason) {
  if (!reason || reason === 'NONE') return { scoringDisposition: 'NORMAL', zeroOrigin: 'NONE' };
  if (reason === 'ANSWER_NOT_PROVIDED') return { scoringDisposition: 'ZERO_CANDIDATE', zeroOrigin: 'CANDIDATE' };
  if (reason.startsWith('SOURCE_')) return { scoringDisposition: 'ZERO_SOURCE_DATA', zeroOrigin: 'SOURCE_DATA' };
  if (reason.startsWith('PROMPT_') || reason.startsWith('CONTEXT_')) return { scoringDisposition: 'INVALID_PROMPT_SOURCE', zeroOrigin: 'SOURCE_DATA' };
  if (reason.startsWith('AMBIGUOUS_')) return { scoringDisposition: 'REVIEW_REQUIRED', zeroOrigin: 'SYSTEM' };
  return { scoringDisposition: 'ZERO_RESPONSE_QUALITY', zeroOrigin: 'RESPONSE_QUALITY' };
}

function classifyError(cause) {
  if (cause?.retryable === false) return cause;
  return workerError(
    cause?.message || 'IIG extended speaking question scoring failed.',
    cause?.code || 'IIG_AI_EXTENDED_SPEAKING_QUESTION_SCORING_FAILED',
    true,
    cause
  );
}

function envValue(overrides, key, envName, fallback = '') {
  if (overrides[key] !== undefined) return overrides[key];
  return process.env[envName] ?? fallback;
}

function resolveConfigForTask(task, overrides = {}) {
  const profile = profileForScorerType(task.scorerType);
  const prefix = profile.envPrefix;
  const profileOverrides = overrides.profiles?.[profile.scorerType] || {};
  const merged = { ...overrides, ...profileOverrides };
  const config = {
    profile,
    endpoint: String(envValue(merged, 'endpoint', `${prefix}_DIFY_ENDPOINT`)).trim(),
    apiKey: String(envValue(merged, 'apiKey', `${prefix}_DIFY_API_KEY`)).trim(),
    timeoutMs: positiveInteger(
      envValue(merged, 'timeoutMs', `${prefix}_DIFY_TIMEOUT_MS`, 180_000),
      180_000,
      1000
    ),
    publicUrl: String(envValue(merged, 'publicUrl', 'PUBLIC_URL')).trim(),
    provider: 'DIFY',
    modelName: String(envValue(
      merged,
      'modelName',
      `${prefix}_DIFY_MODEL`,
      'gemini-3.8-flash'
    )).trim(),
    modelVersion: String(envValue(
      merged,
      'modelVersion',
      `${prefix}_DIFY_MODEL_VERSION`,
      'gemini-3.8-flash'
    )).trim(),
    promptVersion: String(envValue(
      merged,
      'promptVersion',
      `${prefix}_DIFY_PROMPT_VERSION`,
      profile.defaultPromptVersion
    )).trim(),
  };
  if (!config.endpoint || !config.apiKey || !config.modelName || !config.modelVersion
      || !config.promptVersion) {
    throw workerError(
      `${profile.scorerType} Dify endpoint, API key and model lineage must be configured.`,
      'IIG_AI_EXTENDED_SPEAKING_DIFY_CONFIG_MISSING',
      false
    );
  }
  return config;
}

function canonicalReference(task, prefix, label) {
  const provider = String(task[`${prefix}StorageProvider`] || '').trim().toUpperCase();
  const key = String(task[`${prefix}StorageKey`] || '').trim();
  if (!key) return null;
  if (!['R2', 'LOCAL'].includes(provider)) {
    throw workerError(
      `${label} uses unsupported storage provider ${provider || '(empty)'}.`,
      'IIG_AI_EXTENDED_SPEAKING_STORAGE_PROVIDER_UNSUPPORTED',
      false
    );
  }
  return provider === 'R2' ? `r2:${key}` : `local:${key}`;
}

async function resolveAssetUrl(task, storage, publicUrl, prefix, label) {
  const reference = canonicalReference(task, prefix, label);
  if (!reference) return null;
  const url = await storage.getSignedUrl(reference, {
    bucket: task[`${prefix}StorageBucket`],
  });
  if (/^https:\/\//i.test(url)) return url;
  if (!publicUrl) {
    throw workerError(
      `PUBLIC_URL is required for Dify to access locally stored ${label}.`,
      'IIG_AI_EXTENDED_SPEAKING_PUBLIC_URL_REQUIRED',
      false
    );
  }
  const absolute = new URL(url, publicUrl).toString();
  if (!absolute.startsWith('https://')) {
    throw workerError(`${label} must be exposed through HTTPS.`, 'IIG_AI_EXTENDED_SPEAKING_ASSET_URL_INVALID', false);
  }
  return absolute;
}

function buildProviderInput(task, audioUrl, contextImageUrl) {
  const profile = profileForScorerType(task.scorerType);
  const questionNumber = validateQuestion(profile, task.questionNumber);
  const question = task.aiInput?.question || {};
  const transcript = String(task.transcript || '').normalize('NFKC').trim();
  const legacyReason = String(task.upstreamZeroReason || task.zeroReason || 'NONE').trim().toUpperCase() || 'NONE';
  const inferred = inferLegacyResolution(legacyReason);
  const scoringDisposition = String(task.scoringDisposition || inferred.scoringDisposition).trim().toUpperCase();
  const zeroReason = String(task.zeroReason || legacyReason || 'NONE').trim().toUpperCase();
  const zeroOrigin = String(task.zeroOrigin || inferred.zeroOrigin || 'NONE').trim().toUpperCase();
  const questionText = String(question.questionText || question.promptText || '')
    .normalize('NFKC').trim();
  if (scoringDisposition === 'NORMAL' && (!questionText || !transcript || !audioUrl)) {
    throw workerError(
      'Extended speaking scoring requires question text and, for normal attempts, transcript and audio.',
      'IIG_AI_EXTENDED_SPEAKING_SCORING_INPUT_INVALID',
      false
    );
  }
  const response = task.features?.common?.response || {};
  return {
    jobId: task.runId,
    keycode: task.keycode,
    scorerType: profile.scorerType,
    questionNumber,
    responseProfile: responseProfile(questionNumber),
    promptText: question.promptText || '',
    questionText,
    contextText: question.contextText || '',
    transcript,
    audioUrl,
    contextImageUrl,
    audioDurationSeconds: response.durationSeconds
      ?? task.aiInput?.response?.audio?.durationSeconds
      ?? null,
    responseWordCount: response.wordCount ?? 0,
    upstreamZeroReason: zeroReason,
    scoringDisposition,
    zeroReason,
    zeroOrigin,
    resolutionMetadata: task.resolutionMetadata || {},
  };
}

function requestFingerprint(task, config) {
  return fingerprint({
    schemaVersion: config.profile.inputSchemaVersion,
    questionRunId: task.questionRunId,
    inputFingerprint: task.inputFingerprint,
    featureSetId: task.featureSetId,
    audioChecksum: task.audioChecksum,
    contextImageChecksum: task.contextImageChecksum,
    transcript: task.transcript,
    questionNumber: task.questionNumber,
    scorerType: task.scorerType,
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
    dependencies.maxAttempts ?? process.env.IIG_AI_EXTENDED_SPEAKING_SCORING_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS
  );
  let task = null;
  let modelExecutionId = null;
  try {
    task = await taskRepository.loadTask(event);
    const config = resolveConfigForTask(task, dependencies);
    const legacyReason = String(task.upstreamZeroReason || task.zeroReason || 'NONE').trim().toUpperCase();
    const inferred = inferLegacyResolution(legacyReason);
    const deterministicResolution = String(task.scoringDisposition || inferred.scoringDisposition).toUpperCase() !== 'NORMAL';
    const audioUrl = deterministicResolution
      ? null
      : await resolveAssetUrl(task, storage, config.publicUrl, 'audio', 'student audio');
    const contextImageUrl = deterministicResolution
      ? null
      : await resolveAssetUrl(task, storage, config.publicUrl, 'contextImage', 'context image');
    const input = buildProviderInput(task, audioUrl, contextImageUrl);
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
      scorerType: task.scorerType,
      questionScore: providerResult.result.questionScoreRounded,
      groupEvents: completed.groupEvents || 0,
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
const workerId = `iig-ai-extended-speaking-question-scoring-${process.pid}-${randomUUID()}`;

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
    dependencies.concurrency ?? process.env.IIG_AI_EXTENDED_SPEAKING_SCORING_CONCURRENCY,
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
  if (timer || !enabled(process.env.IIG_AI_EXTENDED_SPEAKING_SCORING_WORKER_ENABLED, false)) return timer;
  const taskRepository = dependencies.repository || repository;
  const staleMs = positiveInteger(
    dependencies.staleMs ?? process.env.IIG_AI_EXTENDED_SPEAKING_SCORING_STALE_MS,
    DEFAULT_STALE_MS,
    30_000
  );
  await taskRepository.recoverStale(staleMs);
  const pollMs = positiveInteger(
    dependencies.pollMs ?? process.env.IIG_AI_EXTENDED_SPEAKING_SCORING_POLL_MS,
    DEFAULT_POLL_MS,
    250
  );
  timer = setInterval(() => runBatch({ ...dependencies, repository: taskRepository })
    .catch(error => console.error('[IigAiExtendedSpeakingQuestionScoringWorker]', error.message)), pollMs);
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
  resolveConfigForTask,
  buildProviderInput,
  requestFingerprint,
  responseFingerprint,
  processEvent,
  runOnce,
  runBatch,
  startWorker,
  stopWorker,
};
