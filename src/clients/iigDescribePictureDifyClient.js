const axios = require('axios');
const {
  DescribePictureQuestionOutputError,
  parseDescribePictureQuestionResult,
  parseDescribePictureProgressEvent,
} = require('../modules/iig-ai-scoring/describePictureQuestionResultParser');

const DEFAULT_TIMEOUT_MS = 180000;
const SCORING_DISPOSITIONS = new Set([
  'NORMAL', 'ZERO_CANDIDATE', 'ZERO_RESPONSE_QUALITY', 'ZERO_SOURCE_DATA',
  'INVALID_PROMPT_SOURCE', 'REVIEW_REQUIRED',
]);
const ZERO_ORIGINS = new Set(['NONE', 'CANDIDATE', 'RESPONSE_QUALITY', 'SOURCE_DATA', 'SYSTEM']);
const PROGRESS_OUTPUTS = Object.freeze({
  score_event_json: 'SCORE_READY',
  errors_event_json: 'ERRORS_READY',
  comment_event_json: 'COMMENT_READY',
  completed_event_json: 'QUESTION_COMPLETED',
});

class DifyDescribePictureQuestionError extends Error {
  constructor(message, code, options = {}) {
    super(message);
    this.name = 'DifyDescribePictureQuestionError';
    this.code = code;
    this.retryable = Boolean(options.retryable);
    this.statusCode = options.statusCode || null;
    this.providerRunId = options.providerRunId || null;
  }
}

function clean(value) {
  return String(value || '').trim();
}

function providerError(message, code, options) {
  return new DifyDescribePictureQuestionError(message, code, options);
}

function inferLegacyResolution(reason) {
  if (reason === 'NONE') {
    return { scoringDisposition: 'NORMAL', zeroOrigin: 'NONE' };
  }
  if (reason === 'ANSWER_NOT_PROVIDED') {
    return { scoringDisposition: 'ZERO_CANDIDATE', zeroOrigin: 'CANDIDATE' };
  }
  if (reason.startsWith('SOURCE_')) {
    return { scoringDisposition: 'ZERO_SOURCE_DATA', zeroOrigin: 'SOURCE_DATA' };
  }
  if (reason.startsWith('PROMPT_')) {
    return { scoringDisposition: 'INVALID_PROMPT_SOURCE', zeroOrigin: 'SOURCE_DATA' };
  }
  return { scoringDisposition: 'ZERO_RESPONSE_QUALITY', zeroOrigin: 'RESPONSE_QUALITY' };
}

function workflowEndpoint(value) {
  const base = clean(value).replace(/\/+$/, '');
  if (!base) {
    throw providerError('Describe Picture Dify endpoint is not configured.', 'IIG_AI_DESCRIBE_PICTURE_DIFY_CONFIG_INVALID', {
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
    if (error instanceof DifyDescribePictureQuestionError) throw error;
    throw providerError('Describe Picture Dify endpoint must be a valid HTTPS URL.', 'IIG_AI_DESCRIBE_PICTURE_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  if (parsed.protocol !== 'https:') {
    throw providerError('Describe Picture Dify endpoint must use HTTPS.', 'IIG_AI_DESCRIBE_PICTURE_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  if (!clean(apiKey)) {
    throw providerError('Describe Picture Dify API key is not configured.', 'IIG_AI_DESCRIBE_PICTURE_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  const normalizedTimeout = timeoutMs == null ? DEFAULT_TIMEOUT_MS : Number(timeoutMs);
  if (!Number.isInteger(normalizedTimeout) || normalizedTimeout < 1000) {
    throw providerError('Describe Picture Dify timeout must be at least 1000 ms.', 'IIG_AI_DESCRIBE_PICTURE_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  return { endpoint: parsed.toString(), apiKey: clean(apiKey), timeoutMs: normalizedTimeout };
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw providerError('Describe Picture Dify input must be an object.', 'IIG_AI_DESCRIBE_PICTURE_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  const questionId = clean(input.questionId).toLowerCase();
  if (!['s_q3', 's_q4'].includes(questionId)) {
    throw providerError('Describe Picture questionId must be s_q3 or s_q4.', 'IIG_AI_DESCRIBE_PICTURE_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  const legacyReason = clean(input.upstreamZeroReason || 'NONE').toUpperCase() || 'NONE';
  const inferred = inferLegacyResolution(legacyReason);
  const scoringDisposition = clean(input.scoringDisposition || inferred.scoringDisposition).toUpperCase();
  const zeroReason = clean(input.zeroReason || legacyReason || 'NONE').toUpperCase() || 'NONE';
  const zeroOrigin = clean(input.zeroOrigin || inferred.zeroOrigin || 'NONE').toUpperCase() || 'NONE';
  if (!SCORING_DISPOSITIONS.has(scoringDisposition)) {
    throw providerError('Describe Picture scoringDisposition is unsupported.', 'IIG_AI_DESCRIBE_PICTURE_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  if (!ZERO_ORIGINS.has(zeroOrigin)) {
    throw providerError('Describe Picture zeroOrigin is unsupported.', 'IIG_AI_DESCRIBE_PICTURE_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  if ((scoringDisposition === 'NORMAL' && (zeroReason !== 'NONE' || zeroOrigin !== 'NONE'))
      || (scoringDisposition !== 'NORMAL' && zeroReason === 'NONE')) {
    throw providerError('Describe Picture resolution fields are inconsistent.', 'IIG_AI_DESCRIBE_PICTURE_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  const resolutionMetadata = input.resolutionMetadata ?? {};
  if (!resolutionMetadata || typeof resolutionMetadata !== 'object' || Array.isArray(resolutionMetadata)) {
    throw providerError('Describe Picture resolutionMetadata must be an object.', 'IIG_AI_DESCRIBE_PICTURE_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  const deterministicResolution = scoringDisposition !== 'NORMAL';
  let audioUrl = null;
  if (clean(input.audioUrl)) {
    try {
      audioUrl = new URL(clean(input.audioUrl));
    } catch (_) {
      throw providerError('Describe Picture audio URL is invalid.', 'IIG_AI_DESCRIBE_PICTURE_DIFY_INPUT_INVALID', {
        retryable: false,
      });
    }
    if (audioUrl.protocol !== 'https:') {
      throw providerError('Describe Picture audio URL must use HTTPS.', 'IIG_AI_DESCRIBE_PICTURE_DIFY_INPUT_INVALID', {
        retryable: false,
      });
    }
  }
  let imageUrl = null;
  if (clean(input.imageUrl)) {
    try {
      imageUrl = new URL(clean(input.imageUrl));
    } catch (_) {
      throw providerError('Describe Picture image URL is invalid.', 'IIG_AI_DESCRIBE_PICTURE_DIFY_INPUT_INVALID', {
        retryable: false,
      });
    }
    if (imageUrl.protocol !== 'https:') {
      throw providerError('Describe Picture image URL must use HTTPS.', 'IIG_AI_DESCRIBE_PICTURE_DIFY_INPUT_INVALID', {
        retryable: false,
      });
    }
  }
  const required = ['jobId', 'keycode'];
  for (const field of required) {
    if (!clean(input[field])) {
      throw providerError(`Describe Picture ${field} is required.`, 'IIG_AI_DESCRIBE_PICTURE_DIFY_INPUT_INVALID', {
        retryable: false,
      });
    }
  }
  if (!deterministicResolution && (!clean(input.transcript) || !audioUrl || !imageUrl)) {
    throw providerError(
      'Normal Describe Picture scoring requires transcript, audioUrl and imageUrl.',
      'IIG_AI_DESCRIBE_PICTURE_DIFY_INPUT_INVALID',
      { retryable: false }
    );
  }
  return {
    ...input,
    questionId,
    upstreamZeroReason: legacyReason,
    scoringDisposition,
    zeroReason,
    zeroOrigin,
    resolutionMetadata,
    aiStatus: deterministicResolution ? 'ZERO_SCORE' : 'READY_FOR_AI',
    audioUrl: audioUrl?.toString() || null,
    imageUrl: imageUrl?.toString() || null,
  };
}

function buildDifyInputs(input) {
  const valid = validateInput(input);
  const mapped = {
    schema_version: 'describe-picture-question-input-v1',
    job_id: clean(valid.jobId),
    keycode: clean(valid.keycode).toUpperCase(),
    question_id: valid.questionId,
    group_code: 'DESCRIBE_PICTURE',
    ai_status: valid.aiStatus,
    upstream_zero_reason: valid.upstreamZeroReason,
    scoring_disposition: valid.scoringDisposition,
    zero_reason: valid.zeroReason,
    zero_origin: valid.zeroOrigin,
    resolution_metadata_json: JSON.stringify(valid.resolutionMetadata),
    prompt_text: clean(valid.promptText),
    transcript: clean(valid.transcript),
  };
  if (valid.audioUrl) {
    mapped.student_audio = {
      type: 'audio',
      transfer_method: 'remote_url',
      url: valid.audioUrl,
    };
  }
  if (valid.imageUrl) {
    mapped.prompt_image = {
      type: 'image',
      transfer_method: 'remote_url',
      url: valid.imageUrl,
    };
  }
  return mapped;
}

function providerMessage(error) {
  const detail = error?.response?.data;
  return clean(detail?.message || detail?.error || error?.message) || 'Dify Describe Picture request failed.';
}

function classifyHttpError(error) {
  if (error instanceof DifyDescribePictureQuestionError) return error;
  if (error instanceof DescribePictureQuestionOutputError) {
    return providerError(error.message, error.code, { retryable: error.retryable });
  }
  const statusCode = Number(error?.response?.status) || null;
  const message = providerMessage(error);
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return providerError(message, 'IIG_AI_DESCRIBE_PICTURE_DIFY_TIMEOUT', { retryable: true, statusCode });
  }
  if (statusCode === 401 || statusCode === 403) {
    return providerError(message, 'IIG_AI_DESCRIBE_PICTURE_DIFY_AUTH_FAILED', { retryable: false, statusCode });
  }
  if (statusCode === 429) {
    return providerError(message, 'IIG_AI_DESCRIBE_PICTURE_DIFY_RATE_LIMITED', { retryable: true, statusCode });
  }
  if (statusCode === 408 || statusCode === 425 || (statusCode && statusCode >= 500)) {
    return providerError(message, 'IIG_AI_DESCRIBE_PICTURE_DIFY_UNAVAILABLE', { retryable: true, statusCode });
  }
  if (statusCode && statusCode >= 400) {
    return providerError(message, 'IIG_AI_DESCRIBE_PICTURE_DIFY_REQUEST_REJECTED', { retryable: false, statusCode });
  }
  return providerError(message, 'IIG_AI_DESCRIBE_PICTURE_DIFY_NETWORK_ERROR', { retryable: true, statusCode });
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

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function usageFromFinished(root) {
  const data = root?.data || {};
  return {
    inputTokens: finiteNumber(data.input_tokens),
    outputTokens: finiteNumber(data.output_tokens),
    totalTokens: finiteNumber(data.total_tokens),
    totalPrice: data.total_price ?? null,
    currency: clean(data.currency) || null,
    elapsedTime: finiteNumber(data.elapsed_time),
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
        const progress = parseDescribePictureProgressEvent(outputs[key], expected);
        if (progress.eventType !== expectedType || delivered.has(progress.sequence)) continue;
        delivered.add(progress.sequence);
        if (onProgress) await onProgress(progress);
      }
    }
    if (frame.event === 'workflow_finished') workflowFinished = frame;
    if (frame.event === 'error') {
      throw providerError(clean(frame.message) || 'Dify Describe Picture stream failed.', 'IIG_AI_DESCRIBE_PICTURE_DIFY_WORKFLOW_FAILED', {
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
    throw providerError('Dify Describe Picture stream ended without workflow_finished.', 'IIG_AI_DESCRIBE_PICTURE_DIFY_STREAM_INCOMPLETE', {
      retryable: true,
      providerRunId,
    });
  }
  const status = clean(workflowFinished.data?.status).toLowerCase();
  if (!['succeeded', 'success', 'completed', 'partial-succeeded'].includes(status)) {
    throw providerError(
      clean(workflowFinished.data?.error) || `Dify Describe Picture workflow ended with status ${status}.`,
      'IIG_AI_DESCRIBE_PICTURE_DIFY_WORKFLOW_FAILED',
      { retryable: true, providerRunId }
    );
  }
  const result = parseDescribePictureQuestionResult(workflowFinished.data?.outputs?.result_json, expected);
  if (!delivered.has(4) && onProgress) {
    await onProgress({
      schemaVersion: 'describe-picture-progress-event-v1',
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

function createIigDescribePictureDifyClient({ httpClient = axios } = {}) {
  async function score({ endpoint, apiKey, timeoutMs, input, requestId, onProgress }) {
    const config = validateProviderConfig({ endpoint, apiKey, timeoutMs });
    const difyInputs = buildDifyInputs(input);
    const expected = {
      jobId: difyInputs.job_id,
      keycode: difyInputs.keycode,
      questionId: difyInputs.question_id,
    };
    let response;
    try {
      response = await httpClient.post(config.endpoint, {
        inputs: difyInputs,
        response_mode: 'streaming',
        user: `iig-ai-describe-picture-${clean(requestId) || difyInputs.job_id}`,
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

const defaultClient = createIigDescribePictureDifyClient();

module.exports = {
  DEFAULT_TIMEOUT_MS,
  DifyDescribePictureQuestionError,
  workflowEndpoint,
  validateProviderConfig,
  buildDifyInputs,
  parseSseFrames,
  consumeSse,
  classifyHttpError,
  createIigDescribePictureDifyClient,
  score: defaultClient.score,
};
