const { randomUUID } = require('node:crypto');
const repository = require('./extendedWritingQuestionScoringRepository');
const difyClient = require('../../clients/iigWritingDifyClient');
const storageService = require('../../services/storageService');
const { fingerprint } = require('./scoringPlan');
const { profileForScorerType, validateWritingQuestion } = require('./writingProfiles');

const DEFAULT_POLL_MS = 1000;
const DEFAULT_STALE_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 16;

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

function inferLegacyDisposition(reason) {
  if (!reason || reason === 'NONE') return 'NORMAL';
  if (reason === 'BLANK_RESPONSE') return 'ZERO_CANDIDATE';
  if (['PROMPT_TEXT_NOT_FOUND', 'CONTEXT_NOT_FOUND', 'CONTEXT_IMAGE_NOT_FOUND'].includes(reason)) {
    return 'INVALID_PROMPT_SOURCE';
  }
  if (reason === 'AMBIGUOUS_SOURCE_CONTENT') return 'REVIEW_REQUIRED';
  return 'ZERO_RESPONSE_QUALITY';
}

function classifyError(cause) {
  if (cause?.retryable === false) return cause;
  return workerError(
    cause?.message || 'Extended Writing question scoring failed.',
    cause?.code || 'IIG_AI_EXTENDED_WRITING_SCORING_FAILED',
    true,
    cause
  );
}

function resolveConfig(scorerType, overrides = {}) {
  const profile = profileForScorerType(scorerType);
  if (profile.scorerType === 'WRITE_SENTENCE_PICTURE') {
    throw workerError(
      'Q1-Q5 must use the dedicated Writing scorer.',
      'IIG_AI_EXTENDED_WRITING_PROFILE_INVALID',
      false
    );
  }
  const prefix = profile.envPrefix;
  const config = {
    endpoint: String(overrides.endpoint ?? process.env[`${prefix}_DIFY_ENDPOINT`] ?? '').trim(),
    apiKey: String(overrides.apiKey ?? process.env[`${prefix}_DIFY_API_KEY`] ?? '').trim(),
    timeoutMs: positiveInteger(
      overrides.timeoutMs ?? process.env[`${prefix}_DIFY_TIMEOUT_MS`],
      180_000,
      1000
    ),
    publicUrl: String(overrides.publicUrl ?? process.env.PUBLIC_URL ?? '').trim(),
    provider: 'DIFY',
    modelName: String(overrides.modelName ?? process.env[`${prefix}_DIFY_MODEL`] ?? 'gemini-3.8-flash').trim(),
    modelVersion: String(
      overrides.modelVersion ?? process.env[`${prefix}_DIFY_MODEL_VERSION`] ?? 'gemini-3.8-flash'
    ).trim(),
    promptVersion: String(
      overrides.promptVersion ?? process.env[`${prefix}_DIFY_PROMPT_VERSION`]
        ?? profile.defaultPromptVersion
    ).trim(),
  };
  if (!config.endpoint || !config.apiKey || !config.modelName || !config.modelVersion
      || !config.promptVersion) {
    throw workerError(
      `${profile.scorerType} Dify endpoint, API key and model lineage must be configured.`,
      'IIG_AI_EXTENDED_WRITING_DIFY_CONFIG_MISSING',
      false
    );
  }
  return config;
}

function canonicalContextImageReference(task) {
  const provider = String(task.contextImageStorageProvider || '').trim().toUpperCase();
  const key = String(task.contextImageStorageKey || '').trim();
  if (!key) return null;
  if (!['R2', 'LOCAL'].includes(provider)) {
    throw workerError(
      `Writing context image uses unsupported storage provider ${provider || '(empty)'}.`,
      'IIG_AI_EXTENDED_WRITING_STORAGE_PROVIDER_UNSUPPORTED',
      false
    );
  }
  return provider === 'R2' ? `r2:${key}` : `local:${key}`;
}

async function resolveContextImageUrl(task, storage, publicUrl) {
  const reference = canonicalContextImageReference(task);
  if (!reference) return null;
  const url = await storage.getSignedUrl(reference, {
    bucket: task.contextImageStorageBucket,
  });
  if (/^https:\/\//i.test(url)) return url;
  if (!publicUrl) {
    throw workerError(
      'PUBLIC_URL is required for Dify to access a locally stored Writing context image.',
      'IIG_AI_EXTENDED_WRITING_PUBLIC_URL_REQUIRED',
      false
    );
  }
  const absolute = new URL(url, publicUrl).toString();
  if (!absolute.startsWith('https://')) {
    throw workerError(
      'Writing context image must be exposed through HTTPS.',
      'IIG_AI_EXTENDED_WRITING_CONTEXT_IMAGE_URL_INVALID',
      false
    );
  }
  return absolute;
}

function buildProviderInput(task, contextImageUrl = null) {
  const profile = profileForScorerType(task.scorerType);
  validateWritingQuestion(profile, task.questionNumber);
  if (profile.scorerType === 'WRITE_SENTENCE_PICTURE') {
    throw workerError(
      'Q1-Q5 must use the dedicated Writing scorer.',
      'IIG_AI_EXTENDED_WRITING_PROFILE_INVALID',
      false
    );
  }
  const question = task.aiInput?.question || {};
  const response = task.aiInput?.response || {};
  const upstreamZeroReason = String(task.zeroReason || task.upstreamZeroReason || 'NONE').trim().toUpperCase();
  const scoringDisposition = String(
    task.scoringDisposition || inferLegacyDisposition(upstreamZeroReason)
  ).trim().toUpperCase();
  const deterministicResolution = scoringDisposition !== 'NORMAL';
  const studentWriting = String(response.text || '').trim();
  const directions = String(question.questionText || question.promptText || '').trim();
  const contextText = String(question.contextText || '').trim();
  const prompt = String(directions || contextText).trim();
  const missingWrittenRequestContext = profile.scorerType === 'RESPOND_TO_WRITTEN_REQUEST'
    && (!directions || (!contextImageUrl && !contextText));
  if (!deterministicResolution && (!prompt || missingWrittenRequestContext || !studentWriting)) {
    throw workerError(
      'Extended Writing scoring requires a prompt and student text for normal responses.',
      'IIG_AI_EXTENDED_WRITING_SCORING_INPUT_INVALID',
      false
    );
  }
  return {
    jobId: task.runId,
    keycode: task.keycode,
    scorerType: profile.scorerType,
    questionNumber: task.questionNumber,
    questionText: question.questionText || '',
    promptText: question.promptText || '',
    contextText,
    contextMode: contextImageUrl ? 'IMAGE' : 'TEXT',
    contextImageUrl,
    requiredWords: [],
    studentWriting,
    upstreamZeroReason,
    scoringDisposition,
    zeroReason: upstreamZeroReason,
    zeroOrigin: task.zeroOrigin || null,
    resolutionMetadata: task.resolutionMetadata || {},
  };
}

function requestFingerprint(task, config) {
  return fingerprint({
    schemaVersion: 'extended-writing-question-input-v1',
    questionRunId: task.questionRunId,
    inputFingerprint: task.inputFingerprint,
    featureSetId: task.featureSetId,
    scorerType: task.scorerType,
    studentWriting: task.aiInput?.response?.text || null,
    question: task.aiInput?.question || null,
    contextImageChecksum: task.contextImageChecksum || null,
    provider: config.provider,
    modelName: config.modelName,
    modelVersion: config.modelVersion,
    promptVersion: config.promptVersion,
    scoringDisposition: task.scoringDisposition || 'NORMAL',
    zeroReason: task.zeroReason || null,
    zeroOrigin: task.zeroOrigin || null,
    resolutionMetadata: task.resolutionMetadata || {},
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
    dependencies.maxAttempts ?? process.env.IIG_AI_EXTENDED_WRITING_SCORING_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS
  );
  let task = null;
  let modelExecutionId = null;
  try {
    task = await taskRepository.loadTask(event);
    const config = resolveConfig(task.scorerType, dependencies);
    const effectiveDisposition = task.scoringDisposition
      || inferLegacyDisposition(String(task.upstreamZeroReason || task.zeroReason || 'NONE').toUpperCase());
    const contextImageUrl = effectiveDisposition === 'NORMAL'
      && task.scorerType === 'RESPOND_TO_WRITTEN_REQUEST'
      ? await resolveContextImageUrl(task, storage, config.publicUrl)
      : null;
    const input = buildProviderInput(task, contextImageUrl);
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
      groupResults: completed.groupResults || 0,
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
const workerId = `iig-ai-extended-writing-${process.pid}-${randomUUID()}`;

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
    dependencies.concurrency ?? process.env.IIG_AI_EXTENDED_WRITING_SCORING_CONCURRENCY,
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
  if (timer || !enabled(process.env.IIG_AI_EXTENDED_WRITING_SCORING_WORKER_ENABLED, false)) {
    return timer;
  }
  const taskRepository = dependencies.repository || repository;
  const staleMs = positiveInteger(
    dependencies.staleMs ?? process.env.IIG_AI_EXTENDED_WRITING_SCORING_STALE_MS,
    DEFAULT_STALE_MS,
    30_000
  );
  await taskRepository.recoverStale(staleMs);
  const pollMs = positiveInteger(
    dependencies.pollMs ?? process.env.IIG_AI_EXTENDED_WRITING_SCORING_POLL_MS,
    DEFAULT_POLL_MS,
    250
  );
  timer = setInterval(() => runBatch({ ...dependencies, repository: taskRepository })
    .catch(error => console.error('[IigAiExtendedWritingScoringWorker]', error.message)), pollMs);
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
  canonicalContextImageReference,
  resolveContextImageUrl,
  buildProviderInput,
  requestFingerprint,
  responseFingerprint,
  processEvent,
  runOnce,
  runBatch,
  startWorker,
  stopWorker,
};
