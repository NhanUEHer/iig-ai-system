const axios = require('axios');
const { PROFILE, validateQuestion } = require('../modules/iig-ai-scoring/expressOpinionProfile');
const {
  ExpressOpinionOutputError,
  parseExpressOpinionQuestionResult,
  parseExpressOpinionProgressEvent,
} = require('../modules/iig-ai-scoring/expressOpinionQuestionResultParser');

const DEFAULT_TIMEOUT_MS = 180000;
const PROGRESS_OUTPUTS = Object.freeze({
  score_event_json: 'SCORE_READY',
  errors_event_json: 'ERRORS_READY',
  comment_event_json: 'COMMENT_READY',
  completed_event_json: 'QUESTION_COMPLETED',
});
const SCORING_DISPOSITIONS = new Set([
  'NORMAL', 'ZERO_CANDIDATE', 'ZERO_RESPONSE_QUALITY', 'ZERO_SOURCE_DATA',
  'INVALID_PROMPT_SOURCE', 'REVIEW_REQUIRED',
]);
const ZERO_ORIGINS = new Set(['NONE', 'CANDIDATE', 'RESPONSE_QUALITY', 'SOURCE_DATA', 'SYSTEM']);

class DifyExpressOpinionError extends Error {
  constructor(message, code, options = {}) {
    super(message);
    this.name = 'DifyExpressOpinionError';
    this.code = code;
    this.retryable = Boolean(options.retryable);
    this.statusCode = options.statusCode || null;
    this.providerRunId = options.providerRunId || null;
  }
}

function clean(value) { return String(value || '').normalize('NFKC').trim(); }
function providerError(message, code, options) {
  return new DifyExpressOpinionError(message, code, options);
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

function validateProviderConfig({ endpoint, apiKey, timeoutMs }) {
  const base = clean(endpoint).replace(/\/+$/, '');
  let parsed;
  try { parsed = new URL(base.endsWith('/workflows/run') ? base : `${base}/workflows/run`); } catch (_) {
    throw providerError('Express Opinion Dify endpoint must be a valid HTTPS URL.', 'IIG_AI_EXPRESS_OPINION_DIFY_CONFIG_INVALID', { retryable: false });
  }
  if (parsed.protocol !== 'https:' || !clean(apiKey)) {
    throw providerError('Express Opinion Dify endpoint and API key are invalid.', 'IIG_AI_EXPRESS_OPINION_DIFY_CONFIG_INVALID', { retryable: false });
  }
  const timeout = timeoutMs == null ? DEFAULT_TIMEOUT_MS : Number(timeoutMs);
  if (!Number.isInteger(timeout) || timeout < 1000) {
    throw providerError('Express Opinion Dify timeout must be at least 1000 ms.', 'IIG_AI_EXPRESS_OPINION_DIFY_CONFIG_INVALID', { retryable: false });
  }
  return { endpoint: parsed.toString(), apiKey: clean(apiKey), timeoutMs: timeout };
}

function optionalHttpsUrl(value) {
  if (!clean(value)) return null;
  let parsed;
  try { parsed = new URL(clean(value)); } catch (_) {
    throw providerError('Student audio URL is invalid.', 'IIG_AI_EXPRESS_OPINION_DIFY_INPUT_INVALID', { retryable: false });
  }
  if (parsed.protocol !== 'https:') {
    throw providerError('Student audio URL must use HTTPS.', 'IIG_AI_EXPRESS_OPINION_DIFY_INPUT_INVALID', { retryable: false });
  }
  return parsed.toString();
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildDifyInputs(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw providerError('Express Opinion Dify input must be an object.', 'IIG_AI_EXPRESS_OPINION_DIFY_INPUT_INVALID', { retryable: false });
  }
  validateQuestion(input.scorerType, input.questionNumber);
  const upstreamZeroReason = clean(input.upstreamZeroReason || input.zeroReason || 'NONE').toUpperCase() || 'NONE';
  const inferred = inferLegacyResolution(upstreamZeroReason);
  const scoringDisposition = clean(input.scoringDisposition || inferred.scoringDisposition).toUpperCase();
  const zeroReason = clean(input.zeroReason || upstreamZeroReason).toUpperCase() || 'NONE';
  const zeroOrigin = clean(input.zeroOrigin || inferred.zeroOrigin).toUpperCase() || 'NONE';
  if (!SCORING_DISPOSITIONS.has(scoringDisposition) || !ZERO_ORIGINS.has(zeroOrigin)) {
    throw providerError('Express Opinion resolution contract is unsupported.', 'IIG_AI_EXPRESS_OPINION_DIFY_INPUT_INVALID', { retryable: false });
  }
  if ((scoringDisposition === 'NORMAL' && (zeroReason !== 'NONE' || zeroOrigin !== 'NONE'))
      || (scoringDisposition !== 'NORMAL' && zeroReason === 'NONE')) {
    throw providerError('Express Opinion resolution contract is inconsistent.', 'IIG_AI_EXPRESS_OPINION_DIFY_INPUT_INVALID', { retryable: false });
  }
  const resolutionMetadata = input.resolutionMetadata ?? {};
  if (!resolutionMetadata || typeof resolutionMetadata !== 'object' || Array.isArray(resolutionMetadata)) {
    throw providerError('Express Opinion resolutionMetadata must be an object.', 'IIG_AI_EXPRESS_OPINION_DIFY_INPUT_INVALID', { retryable: false });
  }
  const deterministicResolution = scoringDisposition !== 'NORMAL';
  const audioUrl = optionalHttpsUrl(input.audioUrl);
  if (!clean(input.jobId) || !clean(input.keycode)) {
    throw providerError('Express Opinion jobId and keycode are required.', 'IIG_AI_EXPRESS_OPINION_DIFY_INPUT_INVALID', { retryable: false });
  }
  if (!deterministicResolution && (!clean(input.questionText) || !clean(input.transcript) || !audioUrl)) {
    throw providerError('Normal Express Opinion scoring requires questionText, transcript and audioUrl.', 'IIG_AI_EXPRESS_OPINION_DIFY_INPUT_INVALID', { retryable: false });
  }
  const mapped = {
    schema_version: PROFILE.inputSchemaVersion,
    job_id: clean(input.jobId),
    keycode: clean(input.keycode).toUpperCase(),
    question_id: 's_q11',
    question_number: 11,
    group_code: PROFILE.groupCode,
    scorer_type: PROFILE.scorerType,
    response_profile: PROFILE.responseProfile,
    ai_status: deterministicResolution ? 'ZERO_SCORE' : 'READY_FOR_AI',
    upstream_zero_reason: zeroReason,
    scoring_disposition: scoringDisposition,
    zero_reason: zeroReason,
    zero_origin: zeroOrigin,
    resolution_metadata_json: JSON.stringify(resolutionMetadata),
    prompt_text: clean(input.promptText),
    question: clean(input.questionText),
    transcript: clean(input.transcript),
    audio_duration_seconds: finiteOrNull(input.audioDurationSeconds),
    response_word_count: Math.max(0, Number.parseInt(input.responseWordCount, 10) || 0),
  };
  if (audioUrl) mapped.student_audio = { type: 'audio', transfer_method: 'remote_url', url: audioUrl };
  return mapped;
}

function parseSseFrames(buffer) {
  const frames = [];
  let remaining = buffer.replace(/\r\n/g, '\n');
  let boundary = remaining.indexOf('\n\n');
  while (boundary >= 0) {
    const frame = remaining.slice(0, boundary);
    remaining = remaining.slice(boundary + 2);
    const data = frame.split('\n').filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart()).join('\n');
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
  let finished = null;
  let taskId = null;
  let providerRunId = null;
  const delivered = new Set();
  const consume = async frame => {
    taskId = clean(frame.task_id) || taskId;
    providerRunId = clean(frame.workflow_run_id || frame.data?.id) || providerRunId;
    if (frame.event === 'node_finished') {
      const outputs = frame.data?.outputs || {};
      for (const [key, expectedType] of Object.entries(PROGRESS_OUTPUTS)) {
        if (!outputs[key]) continue;
        const progress = parseExpressOpinionProgressEvent(outputs[key], expected);
        if (progress.eventType !== expectedType || delivered.has(progress.sequence)) continue;
        delivered.add(progress.sequence);
        if (onProgress) await onProgress(progress);
      }
    }
    if (frame.event === 'workflow_finished') finished = frame;
    if (frame.event === 'error') {
      throw providerError(clean(frame.message) || 'Dify Express Opinion stream failed.', 'IIG_AI_EXPRESS_OPINION_DIFY_WORKFLOW_FAILED', { retryable: true, providerRunId });
    }
  };
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
  if (!finished) throw providerError('Dify stream ended without workflow_finished.', 'IIG_AI_EXPRESS_OPINION_DIFY_STREAM_INCOMPLETE', { retryable: true, providerRunId });
  const status = clean(finished.data?.status).toLowerCase();
  if (!['succeeded', 'success', 'completed', 'partial-succeeded'].includes(status)) {
    throw providerError(clean(finished.data?.error) || `Dify workflow ended with status ${status}.`, 'IIG_AI_EXPRESS_OPINION_DIFY_WORKFLOW_FAILED', { retryable: true, providerRunId });
  }
  const result = parseExpressOpinionQuestionResult(finished.data?.outputs?.result_json, expected);
  if (!delivered.has(4) && onProgress) {
    await onProgress({
      schemaVersion: PROFILE.progressSchemaVersion,
      eventType: 'QUESTION_COMPLETED', jobId: result.jobId, questionId: result.questionId,
      sequence: 4, data: result,
    });
  }
  return { providerRunId, taskId, workflowStatus: status, result, usage: usageFromFinished(finished) };
}

function classifyError(error) {
  if (error instanceof DifyExpressOpinionError) return error;
  if (error instanceof ExpressOpinionOutputError) {
    return providerError(error.message, error.code, { retryable: error.retryable });
  }
  const statusCode = Number(error?.response?.status) || null;
  const message = clean(error?.response?.data?.message || error?.response?.data?.error || error?.message)
    || 'Dify Express Opinion request failed.';
  if (statusCode === 401 || statusCode === 403) return providerError(message, 'IIG_AI_EXPRESS_OPINION_DIFY_AUTH_FAILED', { retryable: false, statusCode });
  if (statusCode === 429 || statusCode === 408 || statusCode === 425 || (statusCode && statusCode >= 500)
      || error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return providerError(message, 'IIG_AI_EXPRESS_OPINION_DIFY_UNAVAILABLE', { retryable: true, statusCode });
  }
  return providerError(message, 'IIG_AI_EXPRESS_OPINION_DIFY_REQUEST_REJECTED', { retryable: !statusCode, statusCode });
}

function createIigExpressOpinionDifyClient({ httpClient = axios } = {}) {
  return {
    async score({ endpoint, apiKey, timeoutMs, input, requestId, onProgress }) {
      const config = validateProviderConfig({ endpoint, apiKey, timeoutMs });
      const inputs = buildDifyInputs(input);
      const expected = { jobId: inputs.job_id, keycode: inputs.keycode, scorerType: PROFILE.scorerType, questionNumber: 11 };
      try {
        const response = await httpClient.post(config.endpoint, {
          inputs, response_mode: 'streaming',
          user: `iig-ai-express-opinion-${clean(requestId) || inputs.job_id}`,
        }, {
          headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
          responseType: 'stream', timeout: config.timeoutMs,
        });
        return await consumeSse(response.data, { expected, onProgress });
      } catch (error) { throw classifyError(error); }
    },
  };
}

const defaultClient = createIigExpressOpinionDifyClient();
module.exports = {
  DEFAULT_TIMEOUT_MS, PROGRESS_OUTPUTS, DifyExpressOpinionError,
  validateProviderConfig, buildDifyInputs, parseSseFrames, consumeSse,
  createIigExpressOpinionDifyClient, score: defaultClient.score,
};
