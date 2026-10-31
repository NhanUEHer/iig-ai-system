const axios = require('axios');
const {
  ExtendedSpeakingQuestionOutputError,
  parseExtendedSpeakingQuestionResult,
  parseExtendedSpeakingProgressEvent,
} = require('../modules/iig-ai-scoring/extendedSpeakingQuestionResultParser');
const {
  profileForScorerType,
  responseProfile,
  validateQuestion,
} = require('../modules/iig-ai-scoring/extendedSpeakingProfiles');

const DEFAULT_TIMEOUT_MS = 180000;
const SCORING_DISPOSITIONS = new Set([
  'NORMAL', 'ZERO_CANDIDATE', 'ZERO_SOURCE_DATA', 'ZERO_RESPONSE_QUALITY',
  'INVALID_PROMPT_SOURCE', 'REVIEW_REQUIRED',
]);
const ZERO_ORIGINS = new Set(['NONE', 'CANDIDATE', 'SOURCE_DATA', 'RESPONSE_QUALITY', 'SYSTEM']);
const PROGRESS_OUTPUTS = Object.freeze({
  score_event_json: 'SCORE_READY',
  errors_event_json: 'ERRORS_READY',
  comment_event_json: 'COMMENT_READY',
  completed_event_json: 'QUESTION_COMPLETED',
});

class DifyExtendedSpeakingQuestionError extends Error {
  constructor(message, code, options = {}) {
    super(message);
    this.name = 'DifyExtendedSpeakingQuestionError';
    this.code = code;
    this.retryable = Boolean(options.retryable);
    this.statusCode = options.statusCode || null;
    this.providerRunId = options.providerRunId || null;
  }
}

function clean(value) {
  return String(value || '').normalize('NFKC').trim();
}

function providerError(message, code, options) {
  return new DifyExtendedSpeakingQuestionError(message, code, options);
}

function inferLegacyResolution(reason) {
  if (!reason || reason === 'NONE') return { scoringDisposition: 'NORMAL', zeroOrigin: 'NONE' };
  if (reason === 'ANSWER_NOT_PROVIDED') {
    return { scoringDisposition: 'ZERO_CANDIDATE', zeroOrigin: 'CANDIDATE' };
  }
  if (reason.startsWith('SOURCE_')) {
    return { scoringDisposition: 'ZERO_SOURCE_DATA', zeroOrigin: 'SOURCE_DATA' };
  }
  if (reason.startsWith('PROMPT_') || reason.startsWith('CONTEXT_')) {
    return { scoringDisposition: 'INVALID_PROMPT_SOURCE', zeroOrigin: 'SOURCE_DATA' };
  }
  if (reason.startsWith('AMBIGUOUS_')) {
    return { scoringDisposition: 'REVIEW_REQUIRED', zeroOrigin: 'SYSTEM' };
  }
  return { scoringDisposition: 'ZERO_RESPONSE_QUALITY', zeroOrigin: 'RESPONSE_QUALITY' };
}

function workflowEndpoint(value) {
  const base = clean(value).replace(/\/+$/, '');
  if (!base) {
    throw providerError('Extended speaking Dify endpoint is not configured.', 'IIG_AI_EXTENDED_SPEAKING_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  return base.endsWith('/workflows/run') ? base : `${base}/workflows/run`;
}

function validateProviderConfig({ endpoint, apiKey, timeoutMs }) {
  let parsed;
  try {
    parsed = new URL(workflowEndpoint(endpoint));
  } catch (error) {
    if (error instanceof DifyExtendedSpeakingQuestionError) throw error;
    throw providerError('Extended speaking Dify endpoint must be a valid HTTPS URL.', 'IIG_AI_EXTENDED_SPEAKING_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  if (parsed.protocol !== 'https:') {
    throw providerError('Extended speaking Dify endpoint must use HTTPS.', 'IIG_AI_EXTENDED_SPEAKING_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  if (!clean(apiKey)) {
    throw providerError('Extended speaking Dify API key is not configured.', 'IIG_AI_EXTENDED_SPEAKING_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  const normalizedTimeout = timeoutMs == null ? DEFAULT_TIMEOUT_MS : Number(timeoutMs);
  if (!Number.isInteger(normalizedTimeout) || normalizedTimeout < 1000) {
    throw providerError('Extended speaking Dify timeout must be at least 1000 ms.', 'IIG_AI_EXTENDED_SPEAKING_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  return { endpoint: parsed.toString(), apiKey: clean(apiKey), timeoutMs: normalizedTimeout };
}

function optionalHttpsUrl(value, label) {
  if (!clean(value)) return null;
  let parsed;
  try {
    parsed = new URL(clean(value));
  } catch (_) {
    throw providerError(`${label} URL is invalid.`, 'IIG_AI_EXTENDED_SPEAKING_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  if (parsed.protocol !== 'https:') {
    throw providerError(`${label} URL must use HTTPS.`, 'IIG_AI_EXTENDED_SPEAKING_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  return parsed.toString();
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw providerError('Extended speaking Dify input must be an object.', 'IIG_AI_EXTENDED_SPEAKING_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  const profile = profileForScorerType(input.scorerType);
  const questionNumber = validateQuestion(profile, input.questionNumber);
  const legacyReason = clean(input.upstreamZeroReason || input.zeroReason || 'NONE').toUpperCase() || 'NONE';
  const inferred = inferLegacyResolution(legacyReason);
  const scoringDisposition = clean(input.scoringDisposition || inferred.scoringDisposition).toUpperCase();
  const zeroReason = clean(input.zeroReason || legacyReason || 'NONE').toUpperCase() || 'NONE';
  const zeroOrigin = clean(input.zeroOrigin || inferred.zeroOrigin || 'NONE').toUpperCase() || 'NONE';
  if (!SCORING_DISPOSITIONS.has(scoringDisposition) || !ZERO_ORIGINS.has(zeroOrigin)) {
    throw providerError('Extended speaking resolution contract is unsupported.', 'IIG_AI_EXTENDED_SPEAKING_DIFY_INPUT_INVALID', { retryable: false });
  }
  if ((scoringDisposition === 'NORMAL' && (zeroReason !== 'NONE' || zeroOrigin !== 'NONE'))
      || (scoringDisposition !== 'NORMAL' && zeroReason === 'NONE')) {
    throw providerError('Extended speaking resolution contract is inconsistent.', 'IIG_AI_EXTENDED_SPEAKING_DIFY_INPUT_INVALID', { retryable: false });
  }
  const resolutionMetadata = input.resolutionMetadata ?? {};
  if (!resolutionMetadata || typeof resolutionMetadata !== 'object' || Array.isArray(resolutionMetadata)) {
    throw providerError('Extended speaking resolutionMetadata must be an object.', 'IIG_AI_EXTENDED_SPEAKING_DIFY_INPUT_INVALID', { retryable: false });
  }
  const deterministicResolution = scoringDisposition !== 'NORMAL';
  const audioUrl = optionalHttpsUrl(input.audioUrl, 'Student audio');
  const contextImageUrl = optionalHttpsUrl(input.contextImageUrl, 'Context image');
  if (!clean(input.jobId) || !clean(input.keycode)) {
    throw providerError(
      'Extended speaking jobId and keycode are required.',
      'IIG_AI_EXTENDED_SPEAKING_DIFY_INPUT_INVALID',
      { retryable: false }
    );
  }
  if (!deterministicResolution && (!clean(input.questionText) || !clean(input.transcript) || !audioUrl)) {
    throw providerError(
      'Normal extended speaking scoring requires transcript and audioUrl.',
      'IIG_AI_EXTENDED_SPEAKING_DIFY_INPUT_INVALID',
      { retryable: false }
    );
  }
  if (!deterministicResolution && profile.scorerType === 'RESPOND_USING_INFORMATION'
      && !clean(input.contextText) && !contextImageUrl) {
    throw providerError(
      'Respond Using Information requires contextText or contextImageUrl.',
      'IIG_AI_EXTENDED_SPEAKING_DIFY_INPUT_INVALID',
      { retryable: false }
    );
  }
  return {
    ...input,
    profile,
    questionNumber,
    questionId: `s_q${questionNumber}`,
    responseProfile: responseProfile(questionNumber),
    upstreamZeroReason: zeroReason,
    scoringDisposition,
    zeroReason,
    zeroOrigin,
    resolutionMetadata,
    aiStatus: deterministicResolution ? 'ZERO_SCORE' : 'READY_FOR_AI',
    audioUrl,
    contextImageUrl,
  };
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildDifyInputs(input) {
  const valid = validateInput(input);
  const mapped = {
    schema_version: valid.profile.inputSchemaVersion,
    job_id: clean(valid.jobId),
    keycode: clean(valid.keycode).toUpperCase(),
    question_id: valid.questionId,
    question_number: valid.questionNumber,
    group_code: valid.profile.groupCode,
    scorer_type: valid.profile.scorerType,
    response_profile: valid.responseProfile,
    ai_status: valid.aiStatus,
    upstream_zero_reason: valid.upstreamZeroReason,
    scoring_disposition: valid.scoringDisposition,
    zero_reason: valid.zeroReason,
    zero_origin: valid.zeroOrigin,
    resolution_metadata_json: JSON.stringify(valid.resolutionMetadata),
    context: clean(valid.contextText),
    prompt_text: clean(valid.promptText),
    question: clean(valid.questionText),
    transcript: clean(valid.transcript),
    audio_duration_seconds: finiteOrNull(valid.audioDurationSeconds),
    response_word_count: Math.max(0, Number.parseInt(valid.responseWordCount, 10) || 0),
  };
  if (valid.audioUrl) {
    mapped.student_audio = {
      type: 'audio',
      transfer_method: 'remote_url',
      url: valid.audioUrl,
    };
  }
  if (valid.contextImageUrl) {
    mapped.context_image = {
      type: 'image',
      transfer_method: 'remote_url',
      url: valid.contextImageUrl,
    };
  }
  return mapped;
}

function providerMessage(error) {
  const detail = error?.response?.data;
  return clean(detail?.message || detail?.error || error?.message)
    || 'Dify extended speaking request failed.';
}

function classifyHttpError(error) {
  if (error instanceof DifyExtendedSpeakingQuestionError) return error;
  if (error instanceof ExtendedSpeakingQuestionOutputError) {
    return providerError(error.message, error.code, { retryable: error.retryable });
  }
  const statusCode = Number(error?.response?.status) || null;
  const message = providerMessage(error);
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return providerError(message, 'IIG_AI_EXTENDED_SPEAKING_DIFY_TIMEOUT', { retryable: true, statusCode });
  }
  if (statusCode === 401 || statusCode === 403) {
    return providerError(message, 'IIG_AI_EXTENDED_SPEAKING_DIFY_AUTH_FAILED', { retryable: false, statusCode });
  }
  if (statusCode === 429) {
    return providerError(message, 'IIG_AI_EXTENDED_SPEAKING_DIFY_RATE_LIMITED', { retryable: true, statusCode });
  }
  if (statusCode === 408 || statusCode === 425 || (statusCode && statusCode >= 500)) {
    return providerError(message, 'IIG_AI_EXTENDED_SPEAKING_DIFY_UNAVAILABLE', { retryable: true, statusCode });
  }
  if (statusCode && statusCode >= 400) {
    return providerError(message, 'IIG_AI_EXTENDED_SPEAKING_DIFY_REQUEST_REJECTED', { retryable: false, statusCode });
  }
  return providerError(message, 'IIG_AI_EXTENDED_SPEAKING_DIFY_NETWORK_ERROR', { retryable: true, statusCode });
}

function parseSseFrames(buffer) {
  const frames = [];
  let remaining = buffer.replace(/\r\n/g, '\n');
  let boundary = remaining.indexOf('\n\n');
  while (boundary >= 0) {
    const frame = remaining.slice(0, boundary);
    remaining = remaining.slice(boundary + 2);
    const data = frame.split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n');
    if (data && data !== '[DONE]') frames.push(JSON.parse(data));
    boundary = remaining.indexOf('\n\n');
  }
  return { frames, remaining };
}

function usageFromFinished(root) {
  const data = root?.data || {};
  return {
    inputTokens: finiteOrNull(data.input_tokens),
    outputTokens: finiteOrNull(data.output_tokens),
    totalTokens: finiteOrNull(data.total_tokens),
    totalPrice: data.total_price ?? null,
    currency: clean(data.currency) || null,
    elapsedTime: finiteOrNull(data.elapsed_time),
  };
}

async function consumeSse(stream, { expected, onProgress }) {
  let buffer = '';
  let workflowFinished = null;
  let taskId = null;
  let providerRunId = null;
  const delivered = new Set();

  async function consume(frame) {
    taskId = clean(frame.task_id) || taskId;
    providerRunId = clean(frame.workflow_run_id || frame.data?.id) || providerRunId;
    if (frame.event === 'node_finished') {
      const outputs = frame.data?.outputs || {};
      for (const [key, expectedType] of Object.entries(PROGRESS_OUTPUTS)) {
        if (!outputs[key]) continue;
        const progress = parseExtendedSpeakingProgressEvent(outputs[key], expected);
        if (progress.eventType !== expectedType || delivered.has(progress.sequence)) continue;
        delivered.add(progress.sequence);
        if (onProgress) await onProgress(progress);
      }
    }
    if (frame.event === 'workflow_finished') workflowFinished = frame;
    if (frame.event === 'error') {
      throw providerError(clean(frame.message) || 'Dify extended speaking stream failed.', 'IIG_AI_EXTENDED_SPEAKING_DIFY_WORKFLOW_FAILED', {
        retryable: true,
        providerRunId,
      });
    }
  }

  for await (const chunk of stream) {
    buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    const parsed = parseSseFrames(buffer);
    buffer = parsed.remaining;
    for (const frame of parsed.frames) await consume(frame);
  }
  if (buffer.trim()) {
    const parsed = parseSseFrames(`${buffer}\n\n`);
    for (const frame of parsed.frames) await consume(frame);
  }
  if (!workflowFinished) {
    throw providerError('Dify stream ended without workflow_finished.', 'IIG_AI_EXTENDED_SPEAKING_DIFY_STREAM_INCOMPLETE', {
      retryable: true,
      providerRunId,
    });
  }
  const status = clean(workflowFinished.data?.status).toLowerCase();
  if (!['succeeded', 'success', 'completed', 'partial-succeeded'].includes(status)) {
    throw providerError(
      clean(workflowFinished.data?.error) || `Dify workflow ended with status ${status}.`,
      'IIG_AI_EXTENDED_SPEAKING_DIFY_WORKFLOW_FAILED',
      { retryable: true, providerRunId }
    );
  }
  const result = parseExtendedSpeakingQuestionResult(
    workflowFinished.data?.outputs?.result_json,
    expected
  );
  if (!delivered.has(4) && onProgress) {
    await onProgress({
      schemaVersion: expected.profile.progressSchemaVersion,
      eventType: 'QUESTION_COMPLETED',
      jobId: result.jobId,
      questionId: result.questionId,
      sequence: 4,
      data: result,
    });
  }
  return {
    providerRunId,
    taskId,
    workflowStatus: status,
    result,
    usage: usageFromFinished(workflowFinished),
  };
}

function createIigExtendedSpeakingDifyClient({ httpClient = axios } = {}) {
  async function score({ endpoint, apiKey, timeoutMs, input, requestId, onProgress }) {
    const config = validateProviderConfig({ endpoint, apiKey, timeoutMs });
    const difyInputs = buildDifyInputs(input);
    const expected = {
      jobId: difyInputs.job_id,
      keycode: difyInputs.keycode,
      scorerType: difyInputs.scorer_type,
      questionNumber: difyInputs.question_number,
      profile: profileForScorerType(difyInputs.scorer_type),
    };
    try {
      const response = await httpClient.post(config.endpoint, {
        inputs: difyInputs,
        response_mode: 'streaming',
        user: `iig-ai-${difyInputs.scorer_type.toLowerCase()}-${clean(requestId) || difyInputs.job_id}`,
      }, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        responseType: 'stream',
        timeout: config.timeoutMs,
      });
      return await consumeSse(response.data, { expected, onProgress });
    } catch (error) {
      throw classifyHttpError(error);
    }
  }
  return { score };
}

const defaultClient = createIigExtendedSpeakingDifyClient();

module.exports = {
  DEFAULT_TIMEOUT_MS,
  PROGRESS_OUTPUTS,
  DifyExtendedSpeakingQuestionError,
  workflowEndpoint,
  validateProviderConfig,
  validateInput,
  buildDifyInputs,
  parseSseFrames,
  consumeSse,
  classifyHttpError,
  createIigExtendedSpeakingDifyClient,
  score: defaultClient.score,
};
