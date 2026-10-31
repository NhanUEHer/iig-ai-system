const axios = require('axios');
const {
  Q5Q10GroupOutputError,
  parseQ5Q10GroupResult,
} = require('../modules/iig-ai-scoring/q5Q10GroupResultParser');

const DEFAULT_TIMEOUT_MS = 120000;

class DifyQ5Q10GroupError extends Error {
  constructor(message, code, options = {}) {
    super(message);
    this.name = 'DifyQ5Q10GroupError';
    this.code = code;
    this.retryable = Boolean(options.retryable);
    this.statusCode = options.statusCode || null;
  }
}

function clean(value) {
  return String(value || '').normalize('NFKC').trim();
}

function providerError(message, code, options) {
  return new DifyQ5Q10GroupError(message, code, options);
}

function workflowEndpoint(value) {
  const base = clean(value).replace(/\/+$/, '');
  if (!base) {
    throw providerError('Q5-Q10 group Dify endpoint is not configured.', 'IIG_AI_Q5_Q10_GROUP_DIFY_CONFIG_INVALID', {
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
    if (error instanceof DifyQ5Q10GroupError) throw error;
    throw providerError('Q5-Q10 group endpoint must be a valid HTTPS URL.', 'IIG_AI_Q5_Q10_GROUP_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  if (parsed.protocol !== 'https:' || !clean(apiKey)) {
    throw providerError('Q5-Q10 group endpoint and API key are invalid.', 'IIG_AI_Q5_Q10_GROUP_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  const normalizedTimeout = timeoutMs == null ? DEFAULT_TIMEOUT_MS : Number(timeoutMs);
  if (!Number.isInteger(normalizedTimeout) || normalizedTimeout < 1000) {
    throw providerError('Q5-Q10 group timeout must be at least 1000 ms.', 'IIG_AI_Q5_Q10_GROUP_DIFY_CONFIG_INVALID', {
      retryable: false,
    });
  }
  return { endpoint: parsed.toString(), apiKey: clean(apiKey), timeoutMs: normalizedTimeout };
}

function integerScore(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3) {
    throw providerError(`${label} must be an integer from 0 to 3.`, 'IIG_AI_Q5_Q10_GROUP_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  return parsed;
}

function normalizeQuestion(value, questionNumber) {
  const id = `s_q${questionNumber}`;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw providerError(`${id} score is required.`, 'IIG_AI_Q5_Q10_GROUP_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  return {
    question_id: id,
    question_number: questionNumber,
    scorer_type: clean(value.scorerType),
    response_profile: clean(value.responseProfile),
    pronunciation_score: integerScore(value.pronunciationScore, `${id}.pronunciationScore`),
    intonation_fluency_score: integerScore(value.intonationFluencyScore, `${id}.intonationFluencyScore`),
    grammar_score: integerScore(value.grammarScore, `${id}.grammarScore`),
    vocabulary_score: integerScore(value.vocabularyScore, `${id}.vocabularyScore`),
    cohesion_score: integerScore(value.cohesionScore, `${id}.cohesionScore`),
    relevance_score: integerScore(value.relevanceScore, `${id}.relevanceScore`),
    completeness_score: integerScore(value.completenessScore, `${id}.completenessScore`),
    final_score: integerScore(value.finalScore, `${id}.finalScore`),
  };
}

function buildDifyInputs(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || !clean(input.jobId) || !clean(input.keycode)) {
    throw providerError('Q5-Q10 group jobId and keycode are required.', 'IIG_AI_Q5_Q10_GROUP_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  const scores = input.questionScores || {};
  const questions = [5, 6, 7, 8, 9, 10]
    .map(number => normalizeQuestion(scores[`s_q${number}`], number));
  return {
    schema_version: 'respond-q5-q10-group-input-v1',
    job_id: clean(input.jobId),
    keycode: clean(input.keycode).toUpperCase(),
    group_code: 'RESPOND_Q5_Q10',
    questions_json: JSON.stringify(questions),
  };
}

function classifyHttpError(error) {
  if (error instanceof DifyQ5Q10GroupError) return error;
  if (error instanceof Q5Q10GroupOutputError) {
    return providerError(error.message, error.code, { retryable: error.retryable });
  }
  const statusCode = Number(error?.response?.status) || null;
  const message = clean(error?.response?.data?.message || error?.response?.data?.error || error?.message)
    || 'Q5-Q10 group request failed.';
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT'
      || statusCode === 429 || statusCode === 408 || statusCode === 425
      || (statusCode && statusCode >= 500)) {
    return providerError(message, 'IIG_AI_Q5_Q10_GROUP_DIFY_UNAVAILABLE', { retryable: true, statusCode });
  }
  return providerError(message, 'IIG_AI_Q5_Q10_GROUP_DIFY_REQUEST_REJECTED', {
    retryable: false,
    statusCode,
  });
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

function createIigQ5Q10GroupDifyClient({ httpClient = axios } = {}) {
  async function score({ endpoint, apiKey, timeoutMs, input, requestId }) {
    const config = validateProviderConfig({ endpoint, apiKey, timeoutMs });
    const difyInputs = buildDifyInputs(input);
    try {
      const response = await httpClient.post(config.endpoint, {
        inputs: difyInputs,
        response_mode: 'blocking',
        user: `iig-ai-q5-q10-group-${clean(requestId) || difyInputs.job_id}`,
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
          clean(data.error) || `Q5-Q10 group workflow ended with status ${status || '(empty)'}.`,
          'IIG_AI_Q5_Q10_GROUP_DIFY_WORKFLOW_FAILED',
          { retryable: true }
        );
      }
      return {
        providerRunId: clean(data.id) || null,
        taskId: clean(response.data?.task_id) || null,
        workflowStatus: status,
        result: parseQ5Q10GroupResult(data.outputs?.result_json, {
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

const defaultClient = createIigQ5Q10GroupDifyClient();

module.exports = {
  DEFAULT_TIMEOUT_MS,
  DifyQ5Q10GroupError,
  workflowEndpoint,
  validateProviderConfig,
  buildDifyInputs,
  classifyHttpError,
  createIigQ5Q10GroupDifyClient,
  score: defaultClient.score,
};
