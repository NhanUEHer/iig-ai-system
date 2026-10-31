const axios = require('axios');
const {
  WritingQ1Q5GroupOutputError,
  parseWritingQ1Q5GroupResult,
} = require('../modules/iig-ai-scoring/writingQ1Q5GroupResultParser');

const DEFAULT_TIMEOUT_MS = 120000;

class DifyWritingQ1Q5GroupError extends Error {
  constructor(message, code, options = {}) {
    super(message);
    this.name = 'DifyWritingQ1Q5GroupError';
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
  return new DifyWritingQ1Q5GroupError(message, code, options);
}

function workflowEndpoint(value) {
  const base = clean(value).replace(/\/+$/, '');
  if (!base) {
    throw providerError('Writing Q1-Q5 group Dify endpoint is not configured.', 'IIG_AI_WRITE_SENTENCE_PICTURE_GROUP_DIFY_CONFIG_INVALID', {
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
    if (error instanceof DifyWritingQ1Q5GroupError) throw error;
    throw providerError('Writing Q1-Q5 group Dify endpoint must be a valid HTTPS URL.', 'IIG_AI_WRITE_SENTENCE_PICTURE_GROUP_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  if (parsed.protocol !== 'https:') {
    throw providerError('Writing Q1-Q5 group Dify endpoint must use HTTPS.', 'IIG_AI_WRITE_SENTENCE_PICTURE_GROUP_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  if (!clean(apiKey)) {
    throw providerError('Writing Q1-Q5 group Dify API key is not configured.', 'IIG_AI_WRITE_SENTENCE_PICTURE_GROUP_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  const normalizedTimeout = timeoutMs == null ? DEFAULT_TIMEOUT_MS : Number(timeoutMs);
  if (!Number.isInteger(normalizedTimeout) || normalizedTimeout < 1000) {
    throw providerError('Writing Q1-Q5 group Dify timeout must be at least 1000 ms.', 'IIG_AI_WRITE_SENTENCE_PICTURE_GROUP_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  return { endpoint: parsed.toString(), apiKey: clean(apiKey), timeoutMs: normalizedTimeout };
}

function integerScore(value, label) {
  const score = Number(value);
  if (!Number.isInteger(score) || score < 0 || score > 3) {
    throw providerError(`${label} must be an integer from 0 to 3.`, 'IIG_AI_WRITE_SENTENCE_PICTURE_GROUP_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  return score;
}

function normalizeQuestion(value, questionId, questionNumber) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw providerError(`${questionId} score is required.`, 'IIG_AI_WRITE_SENTENCE_PICTURE_GROUP_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  return {
    question_id: questionId,
    question_number: questionNumber,
    grammar_score: integerScore(value.grammarScore, `${questionId}.grammarScore`),
    picture_relevance_score: integerScore(
      value.pictureRelevanceScore,
      `${questionId}.pictureRelevanceScore`
    ),
    required_word_usage_score: integerScore(
      value.requiredWordUsageScore,
      `${questionId}.requiredWordUsageScore`
    ),
    sentence_quality_score: integerScore(
      value.sentenceQualityScore,
      `${questionId}.sentenceQualityScore`
    ),
    final_score: integerScore(value.finalScore, `${questionId}.finalScore`),
  };
}

function buildDifyInputs(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw providerError('Writing Q1-Q5 group input must be an object.', 'IIG_AI_WRITE_SENTENCE_PICTURE_GROUP_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  if (!clean(input.jobId) || !clean(input.keycode)) {
    throw providerError('Writing Q1-Q5 group jobId and keycode are required.', 'IIG_AI_WRITE_SENTENCE_PICTURE_GROUP_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  const scores = input.questionScores || {};
  const questions = [1, 2, 3, 4, 5].map(number => {
    const questionId = `w_q${number}`;
    return normalizeQuestion(scores[questionId], questionId, number);
  });
  return {
    schema_version: 'write-sentence-group-input-v1',
    job_id: clean(input.jobId),
    keycode: clean(input.keycode).toUpperCase(),
    group_code: 'WRITE_SENTENCE_PICTURE',
    questions_json: JSON.stringify(questions),
  };
}

function providerMessage(error) {
  const detail = error?.response?.data;
  return clean(detail?.message || detail?.error || error?.message) || 'Dify Writing Q1-Q5 group request failed.';
}

function classifyHttpError(error) {
  if (error instanceof DifyWritingQ1Q5GroupError) return error;
  if (error instanceof WritingQ1Q5GroupOutputError) {
    return providerError(error.message, error.code, { retryable: error.retryable });
  }
  const statusCode = Number(error?.response?.status) || null;
  const message = providerMessage(error);
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return providerError(message, 'IIG_AI_WRITE_SENTENCE_PICTURE_GROUP_DIFY_TIMEOUT', { retryable: true, statusCode });
  }
  if (statusCode === 401 || statusCode === 403) {
    return providerError(message, 'IIG_AI_WRITE_SENTENCE_PICTURE_GROUP_DIFY_AUTH_FAILED', { retryable: false, statusCode });
  }
  if (statusCode === 429) {
    return providerError(message, 'IIG_AI_WRITE_SENTENCE_PICTURE_GROUP_DIFY_RATE_LIMITED', { retryable: true, statusCode });
  }
  if (statusCode === 408 || statusCode === 425 || (statusCode && statusCode >= 500)) {
    return providerError(message, 'IIG_AI_WRITE_SENTENCE_PICTURE_GROUP_DIFY_UNAVAILABLE', { retryable: true, statusCode });
  }
  if (statusCode && statusCode >= 400) {
    return providerError(message, 'IIG_AI_WRITE_SENTENCE_PICTURE_GROUP_DIFY_REQUEST_REJECTED', { retryable: false, statusCode });
  }
  return providerError(message, 'IIG_AI_WRITE_SENTENCE_PICTURE_GROUP_DIFY_NETWORK_ERROR', { retryable: true, statusCode });
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

function createIigWritingQ1Q5GroupDifyClient({ httpClient = axios } = {}) {
  async function score({ endpoint, apiKey, timeoutMs, input, requestId }) {
    const config = validateProviderConfig({ endpoint, apiKey, timeoutMs });
    const difyInputs = buildDifyInputs(input);
    try {
      const response = await httpClient.post(config.endpoint, {
        inputs: difyInputs,
        response_mode: 'blocking',
        user: `iig-ai-write-sentence-group-${clean(requestId) || difyInputs.job_id}`,
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
          clean(data.error) || `Dify Writing Q1-Q5 group workflow ended with status ${status || '(empty)'}.`,
          'IIG_AI_WRITE_SENTENCE_PICTURE_GROUP_DIFY_WORKFLOW_FAILED',
          { retryable: true, providerRunId: clean(data.id) || null }
        );
      }
      return {
        providerRunId: clean(data.id) || null,
        taskId: clean(response.data?.task_id) || null,
        workflowStatus: status,
        result: parseWritingQ1Q5GroupResult(data.outputs?.result_json, {
          jobId: difyInputs.job_id,
          keycode: difyInputs.keycode,
        }),
        usage: usageFromResponse(data),
      };
    } catch (error) {
      throw classifyHttpError(error);
    }
  }
  return { score };
}

const defaultClient = createIigWritingQ1Q5GroupDifyClient();

module.exports = {
  DEFAULT_TIMEOUT_MS,
  DifyWritingQ1Q5GroupError,
  workflowEndpoint,
  validateProviderConfig,
  buildDifyInputs,
  classifyHttpError,
  createIigWritingQ1Q5GroupDifyClient,
  score: defaultClient.score,
};
