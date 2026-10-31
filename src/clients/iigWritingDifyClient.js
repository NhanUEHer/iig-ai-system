const axios = require('axios');
const { profileForScorerType, validateWritingQuestion } = require('../modules/iig-ai-scoring/writingProfiles');
const {
  WritingQuestionOutputError,
  parseWritingQuestionResult,
} = require('../modules/iig-ai-scoring/writingQuestionResultParser');

const DEFAULT_TIMEOUT_MS = 180000;
const SCORING_DISPOSITIONS = new Set([
  'NORMAL', 'ZERO_CANDIDATE', 'ZERO_RESPONSE_QUALITY', 'INVALID_PROMPT_SOURCE', 'REVIEW_REQUIRED',
]);
const ZERO_ORIGINS = new Set(['NONE', 'CANDIDATE', 'RESPONSE_QUALITY', 'SOURCE_DATA', 'SYSTEM']);

class DifyWritingError extends Error {
  constructor(message, code, options = {}) {
    super(message);
    this.name = 'DifyWritingError';
    this.code = code;
    this.retryable = Boolean(options.retryable);
    this.statusCode = options.statusCode || null;
    this.providerRunId = options.providerRunId || null;
  }
}

function clean(value) { return String(value || '').normalize('NFKC').trim(); }
function inferLegacyResolution(reason) {
  if (!reason || reason === 'NONE') return { scoringDisposition: 'NORMAL', zeroOrigin: 'NONE' };
  if (reason === 'BLANK_RESPONSE') return { scoringDisposition: 'ZERO_CANDIDATE', zeroOrigin: 'CANDIDATE' };
  if (['PROMPT_TEXT_NOT_FOUND', 'CONTEXT_NOT_FOUND', 'CONTEXT_IMAGE_NOT_FOUND'].includes(reason)) {
    return { scoringDisposition: 'INVALID_PROMPT_SOURCE', zeroOrigin: 'SOURCE_DATA' };
  }
  if (reason === 'AMBIGUOUS_SOURCE_CONTENT') {
    return { scoringDisposition: 'REVIEW_REQUIRED', zeroOrigin: 'SYSTEM' };
  }
  return { scoringDisposition: 'ZERO_RESPONSE_QUALITY', zeroOrigin: 'RESPONSE_QUALITY' };
}
function providerError(message, code, options) { return new DifyWritingError(message, code, options); }
function endpoint(value) {
  const base = clean(value).replace(/\/+$/, '');
  if (!base) throw providerError('Writing Dify endpoint is missing.', 'IIG_AI_WRITING_DIFY_CONFIG_INVALID', { retryable: false });
  let url;
  try {
    url = new URL(base.endsWith('/workflows/run') ? base : `${base}/workflows/run`);
  } catch (_) {
    throw providerError('Writing Dify endpoint is invalid.', 'IIG_AI_WRITING_DIFY_CONFIG_INVALID', { retryable: false });
  }
  if (url.protocol !== 'https:') throw providerError('Writing Dify endpoint must use HTTPS.', 'IIG_AI_WRITING_DIFY_CONFIG_INVALID', { retryable: false });
  return url.toString();
}

function buildDifyInputs(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw providerError('Writing input must be an object.', 'IIG_AI_WRITING_DIFY_INPUT_INVALID', { retryable: false });
  }
  const profile = profileForScorerType(input.scorerType);
  const questionNumber = validateWritingQuestion(profile, input.questionNumber);
  const zeroReason = clean(input.zeroReason || input.upstreamZeroReason || 'NONE').toUpperCase();
  const inferred = inferLegacyResolution(zeroReason);
  const scoringDisposition = clean(input.scoringDisposition || inferred.scoringDisposition).toUpperCase();
  const zeroOrigin = clean(input.zeroOrigin || inferred.zeroOrigin).toUpperCase();
  if (!SCORING_DISPOSITIONS.has(scoringDisposition) || !ZERO_ORIGINS.has(zeroOrigin)) {
    throw providerError('Writing resolution contract is invalid.', 'IIG_AI_WRITING_DIFY_INPUT_INVALID', { retryable: false });
  }
  const deterministicResolution = scoringDisposition !== 'NORMAL';
  const studentWriting = clean(input.studentWriting);
  const contextText = clean(input.contextText);
  const contextImageUrl = clean(input.contextImageUrl);
  if (!deterministicResolution && !studentWriting) {
    throw providerError('Normal Writing input requires student text.', 'IIG_AI_WRITING_DIFY_INPUT_INVALID', { retryable: false });
  }
  const mapped = {
    schema_version: 1,
    job_id: clean(input.jobId),
    keycode: clean(input.keycode).toUpperCase(),
    question_id: `w_q${questionNumber}`,
    question_number: questionNumber,
    group_code: profile.groupCode,
    scorer_type: profile.scorerType,
    ai_status: deterministicResolution ? 'ZERO_SCORE' : 'READY_FOR_AI',
    upstream_zero_reason: zeroReason,
    scoring_disposition: scoringDisposition,
    zero_reason: zeroReason,
    zero_origin: zeroOrigin,
    resolution_metadata_json: JSON.stringify(input.resolutionMetadata || {}),
    question: clean(input.questionText),
    prompt_text: clean(input.promptText),
    context_mode: contextImageUrl ? 'IMAGE' : 'TEXT',
    context: contextImageUrl ? '' : contextText,
    required_words_json: JSON.stringify(Array.isArray(input.requiredWords) ? input.requiredWords : []),
    student_writing: studentWriting,
  };
  if (!mapped.job_id || !mapped.keycode) {
    throw providerError('Writing jobId and keycode are required.', 'IIG_AI_WRITING_DIFY_INPUT_INVALID', { retryable: false });
  }
  if (!deterministicResolution && profile.scorerType === 'RESPOND_TO_WRITTEN_REQUEST') {
    if (!clean(input.questionText || input.promptText)) {
      throw providerError('Written-request directions are required.', 'IIG_AI_WRITING_DIFY_INPUT_INVALID', { retryable: false });
    }
    if (!contextImageUrl && !contextText) {
      throw providerError('Written-request context text or image is required.', 'IIG_AI_WRITING_DIFY_INPUT_INVALID', { retryable: false });
    }
  }
  if (!deterministicResolution && contextImageUrl) {
    let contextImage;
    try { contextImage = new URL(contextImageUrl); } catch (_) {
      throw providerError('Writing context image URL is invalid.', 'IIG_AI_WRITING_DIFY_INPUT_INVALID', { retryable: false });
    }
    if (contextImage.protocol !== 'https:') {
      throw providerError('Writing context image URL must use HTTPS.', 'IIG_AI_WRITING_DIFY_INPUT_INVALID', { retryable: false });
    }
    mapped.context_image = {
      type: 'image', transfer_method: 'remote_url', url: contextImage.toString(),
    };
  }
  if (input.pictureUrl) {
    let picture;
    try { picture = new URL(clean(input.pictureUrl)); } catch (_) {
      throw providerError('Writing picture URL is invalid.', 'IIG_AI_WRITING_DIFY_INPUT_INVALID', { retryable: false });
    }
    if (picture.protocol !== 'https:') throw providerError('Writing picture URL must use HTTPS.', 'IIG_AI_WRITING_DIFY_INPUT_INVALID', { retryable: false });
    mapped.picture = { type: 'image', transfer_method: 'remote_url', url: picture.toString() };
  }
  return { profile, mapped };
}

function classify(error) {
  if (error instanceof DifyWritingError) return error;
  if (error instanceof WritingQuestionOutputError) {
    return providerError(error.message, error.code, { retryable: error.retryable });
  }
  const statusCode = Number(error?.response?.status) || null;
  const message = clean(error?.response?.data?.message || error?.message) || 'Dify Writing request failed.';
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') return providerError(message, 'IIG_AI_WRITING_DIFY_TIMEOUT', { retryable: true });
  if ([401, 403].includes(statusCode)) return providerError(message, 'IIG_AI_WRITING_DIFY_AUTH_FAILED', { retryable: false, statusCode });
  if (statusCode === 429 || statusCode === 408 || statusCode === 425 || statusCode >= 500) return providerError(message, 'IIG_AI_WRITING_DIFY_UNAVAILABLE', { retryable: true, statusCode });
  return providerError(message, 'IIG_AI_WRITING_DIFY_REQUEST_REJECTED', { retryable: false, statusCode });
}

function usage(data, root) {
  const number = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
    ? null : Number(value);
  return {
    inputTokens: number(data.input_tokens), outputTokens: number(data.output_tokens),
    totalTokens: number(data.total_tokens), totalPrice: data.total_price ?? null,
    currency: clean(data.currency) || null, elapsedTime: number(data.elapsed_time ?? root.elapsed_time),
  };
}

function createIigWritingDifyClient({ httpClient = axios } = {}) {
  async function score({ endpoint: endpointValue, apiKey, timeoutMs, input, requestId }) {
    const url = endpoint(endpointValue);
    if (!clean(apiKey)) throw providerError('Writing Dify API key is missing.', 'IIG_AI_WRITING_DIFY_CONFIG_INVALID', { retryable: false });
    const { profile, mapped } = buildDifyInputs(input);
    try {
      const response = await httpClient.post(url, {
        inputs: mapped, response_mode: 'blocking',
        user: `iig-ai-writing-${clean(requestId) || mapped.job_id}`,
      }, { headers: { Authorization: `Bearer ${clean(apiKey)}`, 'Content-Type': 'application/json' }, timeout: Number(timeoutMs) || DEFAULT_TIMEOUT_MS });
      const root = response?.data || {};
      const data = root.data || root;
      const status = clean(data.status).toLowerCase();
      const providerRunId = clean(data.workflow_run_id || root.workflow_run_id || data.id) || null;
      if (status && !['succeeded', 'success', 'completed', 'partial-succeeded'].includes(status)) {
        throw providerError(clean(data.error) || `Dify workflow ended with ${status}.`, 'IIG_AI_WRITING_DIFY_WORKFLOW_FAILED', { retryable: true, providerRunId });
      }
      const result = parseWritingQuestionResult(data.outputs?.result_json ?? data.outputs?.result, {
        jobId: mapped.job_id, keycode: mapped.keycode,
        scorerType: profile.scorerType, questionNumber: mapped.question_number,
      });
      return { provider: 'DIFY', providerRunId, workflowStatus: status, result, usage: usage(data, root) };
    } catch (error) { throw classify(error); }
  }
  return { score };
}

const client = createIigWritingDifyClient();
module.exports = { DEFAULT_TIMEOUT_MS, DifyWritingError, endpoint, buildDifyInputs, createIigWritingDifyClient, score: client.score };
