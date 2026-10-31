const { randomUUID } = require('node:crypto');
const repository = require('./writingQuestionScoringRepository');
const difyClient = require('../../clients/iigWritingDifyClient');
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
    cause?.message || 'IIG Writing question scoring failed.',
    cause?.code || 'IIG_AI_WRITING_QUESTION_SCORING_FAILED',
    true,
    cause
  );
}

function resolveConfig(overrides = {}) {
  const config = {
    endpoint: String(overrides.endpoint ?? process.env.IIG_AI_WRITE_SENTENCE_PICTURE_DIFY_ENDPOINT ?? '').trim(),
    apiKey: String(overrides.apiKey ?? process.env.IIG_AI_WRITE_SENTENCE_PICTURE_DIFY_API_KEY ?? '').trim(),
    timeoutMs: positiveInteger(
      overrides.timeoutMs ?? process.env.IIG_AI_WRITE_SENTENCE_PICTURE_DIFY_TIMEOUT_MS,
      180_000,
      1000
    ),
    publicUrl: String(overrides.publicUrl ?? process.env.PUBLIC_URL ?? '').trim(),
    provider: 'DIFY',
    modelName: String(
      overrides.modelName ?? process.env.IIG_AI_WRITE_SENTENCE_PICTURE_DIFY_MODEL ?? 'gemini-3.8-flash'
    ).trim(),
    modelVersion: String(
      overrides.modelVersion ?? process.env.IIG_AI_WRITE_SENTENCE_PICTURE_DIFY_MODEL_VERSION ?? 'gemini-3.8-flash'
    ).trim(),
    promptVersion: String(
      overrides.promptVersion ?? process.env.IIG_AI_WRITE_SENTENCE_PICTURE_DIFY_PROMPT_VERSION ?? 'write-sentence-picture-v2'
    ).trim(),
  };
  if (!config.endpoint || !config.apiKey || !config.modelName || !config.modelVersion
      || !config.promptVersion) {
    throw workerError(
      'Writing Dify endpoint, API key and model lineage must be configured.',
      'IIG_AI_WRITING_DIFY_CONFIG_MISSING',
      false
    );
  }
  return config;
}

function canonicalReference(task) {
  const prefix = 'image';
  const provider = String(task[`${prefix}StorageProvider`] || '').trim().toUpperCase();
  const key = String(task[`${prefix}StorageKey`] || '').trim();
  if (!key) {
    throw workerError(
      'Writing prompt image has no canonical storage key.',
      'IIG_AI_WRITING_IMAGE_MISSING',
      false
    );
  }
  return provider === 'R2' ? `r2:${key}` : `local:${key}`;
}

async function resolveImageUrl(task, storage, publicUrl) {
  const prefix = 'image';
  const url = await storage.getSignedUrl(canonicalReference(task), {
    bucket: task[`${prefix}StorageBucket`],
  });
  if (/^https:\/\//i.test(url)) return url;
  if (!publicUrl) {
    throw workerError(
      'PUBLIC_URL is required for Dify to access locally stored Writing image.',
      'IIG_AI_WRITING_PUBLIC_URL_REQUIRED',
      false
    );
  }
  const absolute = new URL(url, publicUrl).toString();
  if (!absolute.startsWith('https://')) {
    throw workerError(
      'Writing image must be exposed through HTTPS.',
      'IIG_AI_WRITING_IMAGE_URL_INVALID',
      false
    );
  }
  return absolute;
}

function resolveRequiredWords(task) {
  const question = task.aiInput?.question || {};
  const explicit = question.requiredWords || task.aiInput?.task?.requiredWords;
  if (Array.isArray(explicit) && explicit.length) {
    return explicit.map(value => String(value).normalize('NFKC').trim()).filter(Boolean).slice(0, 2);
  }
  const contextText = String(question.contextText || '').normalize('NFKC').trim();
  const slashSeparated = contextText.split(/\s*\/\s*/).map(value => value.trim()).filter(Boolean);
  if (slashSeparated.length === 2) return slashSeparated;
  const source = [question.questionText, question.promptText, question.contextText]
    .filter(Boolean).join(' ').normalize('NFKC');
  const quoted = [...source.matchAll(/["“”']([^"“”']{1,40})["“”']/g)]
    .map(match => match[1].trim())
    .filter(value => value.split(/\s+/).length <= 3);
  if (quoted.length >= 2) return quoted.slice(-2);
  const tail = source.match(/(?:words?|từ)\s*(?:are|là)?\s*[:\-]\s*([^.!?]+)/i)?.[1] || '';
  return tail.split(/\s*(?:,|\band\b|\bvà\b)\s*/i).map(value => value.trim())
    .filter(Boolean).slice(0, 2);
}

function buildProviderInput(task, imageUrl) {
  const question = task.aiInput?.question || {};
  const response = task.aiInput?.response || {};
  const upstreamZeroReason = String(task.upstreamZeroReason || 'NONE').trim().toUpperCase();
  if (!Number.isInteger(task.questionNumber) || task.questionNumber < 1 || task.questionNumber > 5
      || !imageUrl || (upstreamZeroReason === 'NONE' && !String(response.text || '').trim())) {
    throw workerError(
      'Writing Dify scoring requires Q1-Q5, student text and a prompt image.',
      'IIG_AI_WRITING_SCORING_INPUT_INVALID',
      false
    );
  }
  const requiredWords = resolveRequiredWords(task);
  if (requiredWords.length !== 2) {
    throw workerError(
      'Writing Q1-Q5 requires exactly two required words or phrases.',
      'IIG_AI_WRITING_REQUIRED_WORDS_INVALID',
      false
    );
  }
  return {
    jobId: task.runId,
    keycode: task.keycode,
    scorerType: task.scorerType,
    questionNumber: task.questionNumber,
    questionText: question.questionText || '',
    promptText: question.promptText || '',
    contextText: question.contextText || '',
    requiredWords,
    studentWriting: response.text || '',
    pictureUrl: imageUrl,
    upstreamZeroReason,
  };
}

function requestFingerprint(task, config) {
  return fingerprint({
    schemaVersion: 'writing-question-input-v1',
    questionRunId: task.questionRunId,
    inputFingerprint: task.inputFingerprint,
    featureSetId: task.featureSetId,
    imageChecksum: task.imageChecksum,
    studentWriting: task.aiInput?.response?.text || null,
    promptText: task.aiInput?.question?.questionText
      || task.aiInput?.question?.promptText
      || null,
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
    dependencies.maxAttempts ?? process.env.IIG_AI_WRITE_SENTENCE_PICTURE_SCORING_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS
  );
  let task = null;
  let modelExecutionId = null;
  try {
    const config = resolveConfig(dependencies);
    task = await taskRepository.loadTask(event);
    const imageUrl = await resolveImageUrl(task, storage, config.publicUrl);
    const input = buildProviderInput(task, imageUrl);
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
const workerId = `iig-ai-writing-question-scoring-${process.pid}-${randomUUID()}`;

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
    dependencies.concurrency ?? process.env.IIG_AI_WRITE_SENTENCE_PICTURE_SCORING_CONCURRENCY,
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
  if (timer || !enabled(process.env.IIG_AI_WRITE_SENTENCE_PICTURE_SCORING_WORKER_ENABLED, false)) return timer;
  const taskRepository = dependencies.repository || repository;
  const staleMs = positiveInteger(
    dependencies.staleMs ?? process.env.IIG_AI_WRITE_SENTENCE_PICTURE_SCORING_STALE_MS,
    DEFAULT_STALE_MS,
    30_000
  );
  await taskRepository.recoverStale(staleMs);
  const pollMs = positiveInteger(
    dependencies.pollMs ?? process.env.IIG_AI_WRITE_SENTENCE_PICTURE_SCORING_POLL_MS,
    DEFAULT_POLL_MS,
    250
  );
  timer = setInterval(() => runBatch({ ...dependencies, repository: taskRepository })
    .catch(error => console.error('[IigAiWritingQuestionScoringWorker]', error.message)), pollMs);
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
  resolveImageUrl,
  resolveRequiredWords,
  buildProviderInput,
  requestFingerprint,
  responseFingerprint,
  processEvent,
  runOnce,
  runBatch,
  startWorker,
  stopWorker,
};
