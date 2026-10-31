const { randomUUID } = require('node:crypto');
const repository = require('./questionTranscriptionRepository');
const { findConfiguredQuestionSttAgent } = require('./questionSttAgentProvider');
const { resolveQuestionType } = require('../scoring/questionType');
const parseTranscription = require('../scoring/transcriptionParser');
const difyClient = require('../../clients/dynamicDifyClient');
const geminiClient = require('../../clients/geminiQuestionSttClient');
const storageService = require('../../services/storageService');

const DEFAULT_POLL_MS = 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_STALE_MS = 10 * 60 * 1000;
// A TOEIC submission has at most six reusable question/context audio prompts.
// Keep the job stage serialized, but transcribe every prompt in that job at once.
const DEFAULT_CONCURRENCY = 6;
const MAX_CONCURRENCY = 6;

function positiveInteger(value, fallback, minimum = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function boundedInteger(value, fallback, minimum, maximum) {
  return Math.min(positiveInteger(value, fallback, minimum), maximum);
}

function retryDelayMs(attempt) {
  return Math.min(10 * 60 * 1000, 10_000 * (2 ** Math.max(0, attempt - 1)));
}

function workerError(message, code, retryable, cause) {
  return Object.assign(new Error(message), { code, retryable, cause });
}

function classifyError(cause) {
  if (cause?.retryable === false) return cause;
  return workerError(
    cause?.message || 'IIG question transcription failed.',
    cause?.code || 'IIG_QUESTION_TRANSCRIPTION_FAILED',
    true,
    cause
  );
}

function usableTranscript(value) {
  const normalized = String(value || '').trim();
  return normalized && !['{}', '[]', 'null', 'undefined'].includes(normalized.toLowerCase());
}

function enabled(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  return !['false', '0', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

function canonicalReference(task) {
  const provider = String(task.canonical_storage_provider || '').toUpperCase();
  const key = String(task.canonical_storage_key || '').trim();
  if (!key) throw workerError('Prepared content audio has no storage key.', 'IIG_STT_AUDIO_MISSING', false);
  return provider === 'R2' ? `r2:${key}` : `local:${key}`;
}

async function mapWithConcurrency(items, concurrency, handler) {
  let nextIndex = 0;
  const results = new Array(items.length);
  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await handler(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

async function resolveAudioUrl(task, storage, publicUrl) {
  const reference = canonicalReference(task);
  const resolved = await storage.getSignedUrl(reference);
  if (/^https?:\/\//i.test(resolved)) return resolved;
  if (!publicUrl) {
    throw workerError(
      'PUBLIC_URL is required for Dify to access locally stored question audio.',
      'IIG_STT_PUBLIC_URL_REQUIRED',
      false
    );
  }
  return new URL(resolved, publicUrl).toString();
}

async function transcribeWithGemini(task, dependencies) {
  const source = await dependencies.storage.downloadBuffer(canonicalReference(task));
  const result = await dependencies.gemini.transcribeQuestion({
    apiKey: dependencies.geminiApiKey,
    audioBuffer: source.buffer,
    mimeType: task.canonical_mime_type || source.contentType || 'audio/mpeg',
    contextText: task.context_text || '',
    model: dependencies.geminiModel,
    timeoutMs: dependencies.geminiTimeoutMs,
    maxOutputTokens: dependencies.geminiMaxOutputTokens,
    thinkingBudget: dependencies.geminiThinkingBudget,
  });
  return {
    transcript: result?.transcript,
    agentId: null,
    metadata: result?.metadata || { provider: 'gemini', model: dependencies.geminiModel },
  };
}

async function transcribeWithDify(task, dependencies) {
  const questionType = resolveQuestionType(task.section_type, task.question_number);
  const sttTarget = String(task.target_type || 'QUESTION').toLowerCase();
  const agent = await dependencies.findAgent({
    apiType: 'STT', sttTarget, questionType,
  });
  if (!agent) {
    throw workerError(
      `No ${sttTarget} STT agent is configured for ${questionType || task.scorer_type}.`,
      'IIG_CONTENT_STT_AGENT_MISSING',
      false
    );
  }
  const audioUrl = await resolveAudioUrl(task, dependencies.storage, dependencies.publicUrl);
  const response = await dependencies.dify.transcribeSpeech(
    agent.api_endpoint,
    agent.api_key,
    audioUrl,
    sttTarget === 'context' ? 'audio_context' : 'audio_question',
    task.context_text || ''
  );
  if (response?.data?.status === 'failed') {
    throw workerError(
      response.data.error || 'Question STT workflow failed.',
      'IIG_QUESTION_STT_WORKFLOW_FAILED',
      true
    );
  }
  return {
    transcript: parseTranscription(response?.data?.outputs || {}),
    agentId: agent.id,
    metadata: { provider: 'dify', ...(response?.data?.metadata || {}) },
  };
}

async function transcribeTask(task, dependencies) {
  const claimed = await dependencies.repository.markTaskProcessing(task.id);
  if (!claimed) return { type: 'skipped', taskId: task.id };
  try {
    let result;
    if (dependencies.provider === 'gemini') {
      try {
        result = await transcribeWithGemini(task, dependencies);
      } catch (geminiError) {
        if (!dependencies.difyFallback) throw geminiError;
        result = await transcribeWithDify(task, dependencies);
        result.metadata.geminiFallbackCode = geminiError.code || 'GEMINI_QUESTION_STT_FAILED';
      }
    } else {
      result = await transcribeWithDify(task, dependencies);
    }
    const transcript = result.transcript;
    if (!usableTranscript(transcript)) {
      throw workerError('Question STT returned an empty transcript.', 'IIG_QUESTION_STT_EMPTY', true);
    }
    await dependencies.repository.markTaskCompleted({
      taskId: task.id,
      transcript,
      agentId: result.agentId,
      metadata: result.metadata,
    });
    return { type: 'completed', taskId: task.id };
  } catch (cause) {
    const error = classifyError(cause);
    await dependencies.repository.markTaskFailed(task.id, error);
    return { type: 'failed', taskId: task.id, error };
  }
}

async function processEvent(event, dependencies = {}) {
  const deps = {
    repository: dependencies.repository || repository,
    findAgent: dependencies.findAgent || findConfiguredQuestionSttAgent,
    dify: dependencies.dify || difyClient,
    gemini: dependencies.gemini || geminiClient,
    storage: dependencies.storage || storageService,
    publicUrl: dependencies.publicUrl ?? process.env.PUBLIC_URL,
    geminiApiKey: dependencies.geminiApiKey
      ?? process.env.GEMINI_QUESTION_STT_API_KEY
      ?? process.env.GEMINI_API_KEY,
    geminiModel: dependencies.geminiModel ?? process.env.GEMINI_QUESTION_STT_MODEL ?? geminiClient.DEFAULT_MODEL,
    geminiTimeoutMs: positiveInteger(
      dependencies.geminiTimeoutMs ?? process.env.GEMINI_QUESTION_STT_TIMEOUT_MS,
      120_000
    ),
    geminiMaxOutputTokens: positiveInteger(
      dependencies.geminiMaxOutputTokens ?? process.env.GEMINI_QUESTION_STT_MAX_OUTPUT_TOKENS,
      1_024
    ),
    geminiThinkingBudget: Math.max(0, Number.parseInt(
      dependencies.geminiThinkingBudget ?? process.env.GEMINI_QUESTION_STT_THINKING_BUDGET,
      10
    ) || 0),
    provider: String(
      dependencies.provider ?? process.env.IIG_QUESTION_STT_PROVIDER
      ?? ((dependencies.geminiApiKey ?? process.env.GEMINI_QUESTION_STT_API_KEY ?? process.env.GEMINI_API_KEY)
        ? 'gemini' : 'dify')
    ).trim().toLowerCase(),
    difyFallback: enabled(
      dependencies.difyFallback ?? process.env.IIG_QUESTION_STT_DIFY_FALLBACK,
      true
    ),
    maxAttempts: positiveInteger(
      dependencies.maxAttempts ?? process.env.IIG_INGESTION_QUESTION_STT_MAX_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS
    ),
    concurrency: boundedInteger(
      dependencies.concurrency ?? process.env.IIG_INGESTION_QUESTION_STT_CONCURRENCY,
      DEFAULT_CONCURRENCY,
      1,
      MAX_CONCURRENCY
    ),
  };
  try {
    const tasks = await deps.repository.loadTasks(event.jobId);
    const outcomes = await mapWithConcurrency(tasks, deps.concurrency, task => transcribeTask(task, deps));
    const failure = outcomes.find(outcome => outcome.type === 'failed');
    if (failure) {
      if (failure.error.retryable && event.publishAttempts < deps.maxAttempts) {
        const delayMs = retryDelayMs(event.publishAttempts);
        await deps.repository.markRetry({ event, error: failure.error, delayMs });
        return { status: 'retry', jobId: event.jobId, code: failure.error.code, delayMs };
      }
      const summary = await deps.repository.completeWithReview({ event, error: failure.error });
      return {
        status: 'completed_with_review', jobId: event.jobId,
        code: failure.error.code, ...summary,
      };
    }
    const summary = await deps.repository.completeEvent(event);
    return {
      status: 'completed',
      jobId: event.jobId,
      completed: outcomes.filter(outcome => outcome.type === 'completed').length,
      skipped: outcomes.filter(outcome => outcome.type === 'skipped').length,
      ...summary,
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
const workerId = `question-transcription-${process.pid}-${randomUUID()}`;

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
  if (timer || String(process.env.IIG_INGESTION_QUESTION_STT_WORKER_ENABLED || 'false') !== 'true') return timer;
  const taskRepository = dependencies.repository || repository;
  const staleMs = positiveInteger(
    process.env.IIG_INGESTION_QUESTION_STT_STALE_MS,
    DEFAULT_STALE_MS,
    60_000
  );
  await taskRepository.recoverStale(staleMs);
  const pollMs = positiveInteger(process.env.IIG_INGESTION_QUESTION_STT_POLL_MS, DEFAULT_POLL_MS, 250);
  timer = setInterval(() => runOnce({ ...dependencies, repository: taskRepository })
    .catch(error => console.error('[IigQuestionTranscriptionWorker]', error.message)), pollMs);
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
  boundedInteger,
  retryDelayMs,
  classifyError,
  usableTranscript,
  mapWithConcurrency,
  canonicalReference,
  resolveAudioUrl,
  transcribeWithGemini,
  transcribeWithDify,
  transcribeTask,
  processEvent,
  runOnce,
  startWorker,
  stopWorker,
};
