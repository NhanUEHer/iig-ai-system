const axios = require('axios');
const {
  DescribePictureGroupOutputError,
  parseDescribePictureGroupResult,
} = require('../modules/iig-ai-scoring/describePictureGroupResultParser');

const DEFAULT_TIMEOUT_MS = 120000;

class DifyDescribePictureGroupError extends Error {
  constructor(message, code, options = {}) {
    super(message);
    this.name = 'DifyDescribePictureGroupError';
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
  return new DifyDescribePictureGroupError(message, code, options);
}

function workflowEndpoint(value) {
  const base = clean(value).replace(/\/+$/, '');
  if (!base) {
    throw providerError('Describe Picture group Dify endpoint is not configured.', 'IIG_AI_DESCRIBE_PICTURE_GROUP_DIFY_CONFIG_INVALID', {
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
    if (error instanceof DifyDescribePictureGroupError) throw error;
    throw providerError('Describe Picture group Dify endpoint must be a valid HTTPS URL.', 'IIG_AI_DESCRIBE_PICTURE_GROUP_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  if (parsed.protocol !== 'https:') {
    throw providerError('Describe Picture group Dify endpoint must use HTTPS.', 'IIG_AI_DESCRIBE_PICTURE_GROUP_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  if (!clean(apiKey)) {
    throw providerError('Describe Picture group Dify API key is not configured.', 'IIG_AI_DESCRIBE_PICTURE_GROUP_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  const normalizedTimeout = timeoutMs == null ? DEFAULT_TIMEOUT_MS : Number(timeoutMs);
  if (!Number.isInteger(normalizedTimeout) || normalizedTimeout < 1000) {
    throw providerError('Describe Picture group Dify timeout must be at least 1000 ms.', 'IIG_AI_DESCRIBE_PICTURE_GROUP_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  return { endpoint: parsed.toString(), apiKey: clean(apiKey), timeoutMs: normalizedTimeout };
}

function integerScore(value, label) {
  const score = Number(value);
  if (!Number.isInteger(score) || score < 0 || score > 3) {
    throw providerError(`${label} must be an integer from 0 to 3.`, 'IIG_AI_DESCRIBE_PICTURE_GROUP_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  return score;
}

function normalizeQuestion(value, questionId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw providerError(`${questionId} score is required.`, 'IIG_AI_DESCRIBE_PICTURE_GROUP_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  return {
    question_id: questionId,
    pronunciation_score: integerScore(value.pronunciationScore, `${questionId}.pronunciationScore`),
    intonation_fluency_score: integerScore(
      value.intonationFluencyScore,
      `${questionId}.intonationFluencyScore`
    ),
    grammar_score: integerScore(value.grammarScore, `${questionId}.grammarScore`),
    vocabulary_score: integerScore(value.vocabularyScore, `${questionId}.vocabularyScore`),
    cohesion_score: integerScore(value.cohesionScore, `${questionId}.cohesionScore`),
    final_score: integerScore(value.finalScore, `${questionId}.finalScore`),
  };
}

function buildDifyInputs(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw providerError('Describe Picture group input must be an object.', 'IIG_AI_DESCRIBE_PICTURE_GROUP_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  if (!clean(input.jobId) || !clean(input.keycode)) {
    throw providerError('Describe Picture group jobId and keycode are required.', 'IIG_AI_DESCRIBE_PICTURE_GROUP_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  const scores = input.questionScores || {};
  const questions = [
    normalizeQuestion(scores.s_q3, 's_q3'),
    normalizeQuestion(scores.s_q4, 's_q4'),
  ];
  return {
    schema_version: 'describe-picture-group-input-v1',
    job_id: clean(input.jobId),
    keycode: clean(input.keycode).toUpperCase(),
    group_code: 'DESCRIBE_PICTURE',
    questions_json: JSON.stringify(questions),
  };
}

function providerMessage(error) {
  const detail = error?.response?.data;
  return clean(detail?.message || detail?.error || error?.message) || 'Dify Describe Picture group request failed.';
}

function classifyHttpError(error) {
  if (error instanceof DifyDescribePictureGroupError) return error;
  if (error instanceof DescribePictureGroupOutputError) {
    return providerError(error.message, error.code, { retryable: error.retryable });
  }
  const statusCode = Number(error?.response?.status) || null;
  const message = providerMessage(error);
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return providerError(message, 'IIG_AI_DESCRIBE_PICTURE_GROUP_DIFY_TIMEOUT', { retryable: true, statusCode });
  }
  if (statusCode === 401 || statusCode === 403) {
    return providerError(message, 'IIG_AI_DESCRIBE_PICTURE_GROUP_DIFY_AUTH_FAILED', { retryable: false, statusCode });
  }
  if (statusCode === 429) {
    return providerError(message, 'IIG_AI_DESCRIBE_PICTURE_GROUP_DIFY_RATE_LIMITED', { retryable: true, statusCode });
  }
  if (statusCode === 408 || statusCode === 425 || (statusCode && statusCode >= 500)) {
    return providerError(message, 'IIG_AI_DESCRIBE_PICTURE_GROUP_DIFY_UNAVAILABLE', { retryable: true, statusCode });
  }
  if (statusCode && statusCode >= 400) {
    return providerError(message, 'IIG_AI_DESCRIBE_PICTURE_GROUP_DIFY_REQUEST_REJECTED', { retryable: false, statusCode });
  }
  return providerError(message, 'IIG_AI_DESCRIBE_PICTURE_GROUP_DIFY_NETWORK_ERROR', { retryable: true, statusCode });
}

function usageFromResponse(data) {
  const metadata = data?.metadata || {};
  const usage = metadata.usage || metadata;
  const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
  return {
    inputTokens: number(usage.prompt_tokens ?? usage.input_tokens),
    outputTokens: number(usage.completion_tokens ?? usage.output_tokens),
    totalTokens: number(usage.total_tokens),
    totalPrice: usage.total_price ?? null,
    currency: clean(usage.currency) || null,
    elapsedTime: number(data?.elapsed_time),
  };
}

function createIigDescribePictureGroupDifyClient({ httpClient = axios } = {}) {
  async function score({ endpoint, apiKey, timeoutMs, input, requestId }) {
    const config = validateProviderConfig({ endpoint, apiKey, timeoutMs });
    const difyInputs = buildDifyInputs(input);
    try {
      const response = await httpClient.post(config.endpoint, {
        inputs: difyInputs,
        response_mode: 'blocking',
        user: `iig-ai-describe-picture-group-${clean(requestId) || difyInputs.job_id}`,
      }, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: config.timeoutMs,
      });
      const data = response.data?.data || response.data || {};
      const status = clean(data.status).toLowerCase();
      if (!['succeeded', 'success', 'completed', 'partial-succeeded'].includes(status)) {
        throw providerError(
          clean(data.error) || `Dify Describe Picture group workflow ended with status ${status || '(empty)'}.`,
          'IIG_AI_DESCRIBE_PICTURE_GROUP_DIFY_WORKFLOW_FAILED',
          { retryable: true, providerRunId: clean(data.id) || null }
        );
      }
      return {
        providerRunId: clean(data.id) || null,
        taskId: clean(response.data?.task_id) || null,
        workflowStatus: status,
        result: parseDescribePictureGroupResult(data.outputs?.result_json),
        usage: usageFromResponse(data),
      };
    } catch (error) {
      throw classifyHttpError(error);
    }
  }
  return { score };
}

const defaultClient = createIigDescribePictureGroupDifyClient();

module.exports = {
  DEFAULT_TIMEOUT_MS,
  DifyDescribePictureGroupError,
  workflowEndpoint,
  validateProviderConfig,
  buildDifyInputs,
  classifyHttpError,
  createIigDescribePictureGroupDifyClient,
  score: defaultClient.score,
};
