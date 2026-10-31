const { randomUUID } = require('node:crypto');
const repository = require('./expressOpinionQuestionScoringRepository');
const difyClient = require('../../clients/iigExpressOpinionDifyClient');
const storageService = require('../../services/storageService');
const { fingerprint } = require('./scoringPlan');
const { PROFILE, validateQuestion } = require('./expressOpinionProfile');

const DEFAULT_POLL_MS = 1000;
const DEFAULT_STALE_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_CONCURRENCY = 8;

function positiveInteger(value, fallback, minimum = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
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
  if (reason.startsWith('PROMPT_') || reason.startsWith('CONTEXT_')) {
    return { scoringDisposition: 'INVALID_PROMPT_SOURCE', zeroOrigin: 'SOURCE_DATA' };
  }
  if (reason.startsWith('AMBIGUOUS_')) return { scoringDisposition: 'REVIEW_REQUIRED', zeroOrigin: 'SYSTEM' };
  return { scoringDisposition: 'ZERO_RESPONSE_QUALITY', zeroOrigin: 'RESPONSE_QUALITY' };
}

function resolveConfig(overrides = {}) {
  const prefix = PROFILE.envPrefix;
  const read = (key, envName, fallback = '') => overrides[key] !== undefined
    ? overrides[key] : process.env[envName] ?? fallback;
  const config = {
    profile: PROFILE,
    endpoint: String(read('endpoint', `${prefix}_DIFY_ENDPOINT`)).trim(),
    apiKey: String(read('apiKey', `${prefix}_DIFY_API_KEY`)).trim(),
    timeoutMs: positiveInteger(read('timeoutMs', `${prefix}_DIFY_TIMEOUT_MS`, 180000), 180000, 1000),
    publicUrl: String(read('publicUrl', 'PUBLIC_URL')).trim(),
    provider: 'DIFY',
    modelName: String(read('modelName', `${prefix}_DIFY_MODEL`, 'gemini-3.8-flash')).trim(),
    modelVersion: String(read('modelVersion', `${prefix}_DIFY_MODEL_VERSION`, 'gemini-3.8-flash')).trim(),
    promptVersion: String(read('promptVersion', `${prefix}_DIFY_PROMPT_VERSION`, PROFILE.defaultPromptVersion)).trim(),
  };
  if (!config.endpoint || !config.apiKey || !config.modelName || !config.modelVersion || !config.promptVersion) {
    throw workerError('Express Opinion Dify endpoint, API key and model lineage must be configured.', 'IIG_AI_EXPRESS_OPINION_DIFY_CONFIG_MISSING', false);
  }
  return config;
}

async function resolveAudioUrl(task, storage, publicUrl) {
  const provider = String(task.audioStorageProvider || '').trim().toUpperCase();
  const key = String(task.audioStorageKey || '').trim();
  if (!key || !['R2', 'LOCAL'].includes(provider)) {
    throw workerError('Express Opinion student audio storage is invalid.', 'IIG_AI_EXPRESS_OPINION_STORAGE_INVALID', false);
  }
  const reference = provider === 'R2' ? `r2:${key}` : `local:${key}`;
  const url = await storage.getSignedUrl(reference, { bucket: task.audioStorageBucket });
  if (/^https:\/\//i.test(url)) return url;
  if (!publicUrl) throw workerError('PUBLIC_URL is required for locally stored student audio.', 'IIG_AI_EXPRESS_OPINION_PUBLIC_URL_REQUIRED', false);
  const absolute = new URL(url, publicUrl).toString();
  if (!absolute.startsWith('https://')) throw workerError('Student audio must be exposed through HTTPS.', 'IIG_AI_EXPRESS_OPINION_ASSET_URL_INVALID', false);
  return absolute;
}

function buildProviderInput(task, audioUrl) {
  validateQuestion(task.scorerType, task.questionNumber);
  const question = task.aiInput?.question || {};
  const transcript = String(task.transcript || '').normalize('NFKC').trim();
  const upstreamZeroReason = String(task.upstreamZeroReason || task.zeroReason || 'NONE').trim().toUpperCase();
  const inferred = inferLegacyResolution(upstreamZeroReason);
  const scoringDisposition = String(task.scoringDisposition || inferred.scoringDisposition).trim().toUpperCase();
  const zeroReason = String(task.zeroReason || upstreamZeroReason || 'NONE').trim().toUpperCase();
  const zeroOrigin = String(task.zeroOrigin || inferred.zeroOrigin || 'NONE').trim().toUpperCase();
  const questionText = String(question.questionText || question.promptText || '').normalize('NFKC').trim();
  if (scoringDisposition === 'NORMAL' && (!questionText || !transcript || !audioUrl)) {
    throw workerError('Normal Express Opinion scoring requires question text, transcript and audio.', 'IIG_AI_EXPRESS_OPINION_SCORING_INPUT_INVALID', false);
  }
  const response = task.features?.common?.response || {};
  return {
    jobId: task.runId,
    keycode: task.keycode,
    scorerType: PROFILE.scorerType,
    questionNumber: 11,
    responseProfile: PROFILE.responseProfile,
    promptText: question.promptText || '',
    questionText,
    transcript,
    audioUrl,
    audioDurationSeconds: response.durationSeconds ?? task.aiInput?.response?.audio?.durationSeconds ?? null,
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
    schemaVersion: PROFILE.inputSchemaVersion, questionRunId: task.questionRunId,
    inputFingerprint: task.inputFingerprint, featureSetId: task.featureSetId,
    audioChecksum: task.audioChecksum, transcript: task.transcript,
    scoringDisposition: task.scoringDisposition || 'NORMAL',
    zeroReason: task.zeroReason || null,
    zeroOrigin: task.zeroOrigin || null,
    resolutionMetadata: task.resolutionMetadata || {},
    questionNumber: 11, scorerType: PROFILE.scorerType, provider: config.provider,
    modelName: config.modelName, modelVersion: config.modelVersion,
    promptVersion: config.promptVersion,
  });
}

function responseFingerprint(providerResult) {
  return fingerprint({ providerRunId: providerResult.providerRunId, workflowStatus: providerResult.workflowStatus, result: providerResult.result });
}

async function processEvent(event, dependencies = {}) {
  const taskRepository = dependencies.repository || repository;
  const storage = dependencies.storage || storageService;
  const client = dependencies.client || difyClient;
  const maxAttempts = positiveInteger(
    dependencies.maxAttempts ?? process.env.IIG_AI_EXPRESS_OPINION_SCORING_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS
  );
  let task = null;
  let modelExecutionId = null;
  try {
    task = await taskRepository.loadTask(event);
    const config = resolveConfig(dependencies);
    const inferred = inferLegacyResolution(String(task.upstreamZeroReason || task.zeroReason || 'NONE').toUpperCase());
    const deterministicResolution = String(task.scoringDisposition || inferred.scoringDisposition).toUpperCase() !== 'NORMAL';
    const audioUrl = deterministicResolution ? null : await resolveAudioUrl(task, storage, config.publicUrl);
    const input = buildProviderInput(task, audioUrl);
    const started = await taskRepository.startTask({
      event, task, lineage: config, requestHash: requestFingerprint(task, config),
    });
    if (!started.started) return { status: 'skipped', runId: event.runId, reason: started.reason };
    modelExecutionId = started.modelExecutionId;
    const providerResult = await client.score({
      endpoint: config.endpoint, apiKey: config.apiKey, timeoutMs: config.timeoutMs,
      input, requestId: modelExecutionId,
      onProgress: progress => taskRepository.recordProgress({ event, task, progress }),
    });
    const completed = await taskRepository.completeTask({
      event, task, modelExecutionId, providerResult,
      responseHash: responseFingerprint(providerResult),
    });
    return {
      status: completed.completed ? 'completed' : 'skipped',
      runId: event.runId, questionRunId: task.questionRunId,
      questionScore: providerResult.result.questionScoreFinal,
      groupResults: completed.groupResults || 0, reason: completed.reason,
    };
  } catch (cause) {
    const error = cause?.retryable === false ? cause : workerError(
      cause?.message || 'Express Opinion question scoring failed.',
      cause?.code || 'IIG_AI_EXPRESS_OPINION_QUESTION_SCORING_FAILED', true, cause
    );
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
const workerId = `iig-ai-express-opinion-scoring-${process.pid}-${randomUUID()}`;

async function runOnce(dependencies = {}) {
  const taskRepository = dependencies.repository || repository;
  const event = await taskRepository.claimNext(dependencies.workerId || workerId);
  return event ? processEvent(event, { ...dependencies, repository: taskRepository }) : null;
}

async function runBatch(dependencies = {}) {
  if (batchRunning) return [];
  batchRunning = true;
  const concurrency = Math.min(32, positiveInteger(
    dependencies.concurrency ?? process.env.IIG_AI_EXPRESS_OPINION_SCORING_CONCURRENCY,
    DEFAULT_CONCURRENCY
  ));
  try {
    return await Promise.all(Array.from({ length: concurrency }, (_, index) => runOnce({
      ...dependencies, workerId: `${dependencies.workerId || workerId}-${index + 1}`,
    })));
  } finally { batchRunning = false; }
}

async function startWorker(dependencies = {}) {
  if (timer || !enabled(process.env.IIG_AI_EXPRESS_OPINION_SCORING_WORKER_ENABLED, false)) return timer;
  const taskRepository = dependencies.repository || repository;
  const staleMs = positiveInteger(dependencies.staleMs ?? process.env.IIG_AI_EXPRESS_OPINION_SCORING_STALE_MS, DEFAULT_STALE_MS, 30000);
  await taskRepository.recoverStale(staleMs);
  const pollMs = positiveInteger(dependencies.pollMs ?? process.env.IIG_AI_EXPRESS_OPINION_SCORING_POLL_MS, DEFAULT_POLL_MS, 250);
  timer = setInterval(() => runBatch({ ...dependencies, repository: taskRepository })
    .catch(error => console.error('[IigAiExpressOpinionQuestionScoringWorker]', error.message)), pollMs);
  timer.unref?.();
  await runBatch({ ...dependencies, repository: taskRepository });
  return timer;
}

function stopWorker() { if (timer) clearInterval(timer); timer = null; }

module.exports = {
  positiveInteger, retryDelayMs, inferLegacyResolution, resolveConfig, buildProviderInput,
  requestFingerprint, responseFingerprint, processEvent, runOnce, runBatch,
  startWorker, stopWorker,
};
