const axios = require('axios');
const {
  ANSWER_STT_INPUT_SCHEMA_VERSION,
  STT_PROFILES,
} = require('../modules/iig-ai-scoring/answerSttContract');
const {
  AnswerSttOutputError,
  parseAnswerSttResult,
  classifyAnswerSttOutcome,
} = require('../modules/iig-ai-scoring/answerSttResultParser');

const DEFAULT_TIMEOUT_MS = 120000;
const PROFILE_SET = new Set(Object.values(STT_PROFILES));

class DifyAnswerSttError extends Error {
  constructor(message, code, options = {}) {
    super(message);
    this.name = 'DifyAnswerSttError';
    this.code = code;
    this.retryable = Boolean(options.retryable);
    this.statusCode = options.statusCode || null;
    this.providerRunId = options.providerRunId || null;
  }
}

function providerError(message, code, options) {
  return new DifyAnswerSttError(message, code, options);
}

function clean(value) {
  return String(value || '').trim();
}

function workflowEndpoint(value) {
  const base = clean(value).replace(/\/+$/, '');
  if (!base) {
    throw providerError(
      'Answer STT Dify endpoint is not configured.',
      'IIG_AI_STT_DIFY_CONFIG_INVALID',
      { retryable: false }
    );
  }
  return base.endsWith('/workflows/run') ? base : `${base}/workflows/run`;
}

function validateProviderConfig({ endpoint, apiKey, timeoutMs }) {
  let parsed;
  try {
    parsed = new URL(workflowEndpoint(endpoint));
  } catch (error) {
    if (error instanceof DifyAnswerSttError) throw error;
    throw providerError(
      'Answer STT Dify endpoint must be a valid HTTPS URL.',
      'IIG_AI_STT_DIFY_CONFIG_INVALID',
      { retryable: false }
    );
  }
  if (parsed.protocol !== 'https:') {
    throw providerError(
      'Answer STT Dify endpoint must use HTTPS.',
      'IIG_AI_STT_DIFY_CONFIG_INVALID',
      { retryable: false }
    );
  }
  if (!clean(apiKey)) {
    throw providerError(
      'Answer STT Dify API key is not configured.',
      'IIG_AI_STT_DIFY_CONFIG_INVALID',
      { retryable: false }
    );
  }
  const normalizedTimeout = timeoutMs == null ? DEFAULT_TIMEOUT_MS : Number(timeoutMs);
  if (!Number.isInteger(normalizedTimeout) || normalizedTimeout < 1000) {
    throw providerError(
      'Answer STT Dify timeout must be an integer of at least 1000 ms.',
      'IIG_AI_STT_DIFY_CONFIG_INVALID',
      { retryable: false }
    );
  }
  return {
    endpoint: parsed.toString(),
    apiKey: clean(apiKey),
    timeoutMs: normalizedTimeout,
  };
}

function validateSttInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw providerError('Answer STT input must be an object.', 'IIG_AI_STT_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  if (input.schema_version !== ANSWER_STT_INPUT_SCHEMA_VERSION) {
    throw providerError(
      `Unsupported Answer STT input schema version: ${input.schema_version}.`,
      'IIG_AI_STT_DIFY_INPUT_INVALID',
      { retryable: false }
    );
  }
  if (!PROFILE_SET.has(input.stt_profile)) {
    throw providerError('Answer STT profile is invalid.', 'IIG_AI_STT_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  if (!/^S_Q\d{1,2}$/.test(clean(input.question_code))) {
    throw providerError('Answer STT question code is invalid.', 'IIG_AI_STT_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  let audioUrl;
  try {
    audioUrl = new URL(clean(input.audio_url));
  } catch (_) {
    throw providerError('Answer STT audio URL is invalid.', 'IIG_AI_STT_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  if (audioUrl.protocol !== 'https:') {
    throw providerError('Answer STT audio URL must use HTTPS.', 'IIG_AI_STT_DIFY_INPUT_INVALID', {
      retryable: false,
    });
  }
  return { ...input, audio_url: audioUrl.toString() };
}

function buildDifyInputs(input) {
  const valid = validateSttInput(input);
  return {
    schema_version: valid.schema_version,
    stt_profile: valid.stt_profile,
    question_code: clean(valid.question_code).toUpperCase(),
    reference_text: clean(valid.reference_text),
    question_text: clean(valid.question_text),
    context_text: clean(valid.context_text),
    student_audio: {
      type: 'audio',
      transfer_method: 'remote_url',
      url: valid.audio_url,
    },
  };
}

function finiteNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function extractUsage(root, data) {
  const metadata = data?.metadata || root?.metadata || {};
  const usage = metadata.usage || {};
  return {
    inputTokens: finiteNumber(
      data?.input_tokens,
      usage.input_tokens,
      usage.prompt_tokens,
      usage.inputTokenCount
    ),
    outputTokens: finiteNumber(
      data?.output_tokens,
      usage.output_tokens,
      usage.completion_tokens,
      usage.outputTokenCount
    ),
    totalTokens: finiteNumber(
      data?.total_tokens,
      root?.total_tokens,
      usage.total_tokens,
      usage.totalTokenCount
    ),
    totalPrice: data?.total_price ?? root?.total_price ?? usage.total_price ?? null,
    currency: clean(data?.currency ?? root?.currency ?? usage.currency) || null,
    elapsedTime: finiteNumber(data?.elapsed_time, root?.elapsed_time),
  };
}

function providerMessage(error) {
  const detail = error?.response?.data;
  return clean(detail?.message || detail?.error || error?.message) || 'Dify Answer STT request failed.';
}

function classifyHttpError(error) {
  if (error instanceof DifyAnswerSttError || error instanceof AnswerSttOutputError) return error;
  const statusCode = Number(error?.response?.status) || null;
  const message = providerMessage(error);
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return providerError(message, 'IIG_AI_STT_DIFY_TIMEOUT', { retryable: true, statusCode });
  }
  if (statusCode === 401 || statusCode === 403) {
    return providerError(message, 'IIG_AI_STT_DIFY_AUTH_FAILED', { retryable: false, statusCode });
  }
  if (statusCode === 429) {
    return providerError(message, 'IIG_AI_STT_DIFY_RATE_LIMITED', { retryable: true, statusCode });
  }
  if (statusCode === 408 || statusCode === 425 || (statusCode && statusCode >= 500)) {
    return providerError(message, 'IIG_AI_STT_DIFY_UNAVAILABLE', { retryable: true, statusCode });
  }
  if (statusCode && statusCode >= 400) {
    return providerError(message, 'IIG_AI_STT_DIFY_REQUEST_REJECTED', {
      retryable: false,
      statusCode,
    });
  }
  return providerError(message, 'IIG_AI_STT_DIFY_NETWORK_ERROR', {
    retryable: true,
    statusCode,
  });
}

function createIigAnswerSttClient({ httpClient = axios } = {}) {
  async function transcribe({ endpoint, apiKey, timeoutMs, input, requestId, modelVersion }) {
    const config = validateProviderConfig({ endpoint, apiKey, timeoutMs });
    const user = clean(requestId);
    if (!user) {
      throw providerError(
        'Answer STT requestId is required for provider traceability.',
        'IIG_AI_STT_DIFY_INPUT_INVALID',
        { retryable: false }
      );
    }

    let response;
    try {
      response = await httpClient.post(config.endpoint, {
        inputs: buildDifyInputs(input),
        response_mode: 'blocking',
        user: `iig-ai-stt-${user}`,
      }, {
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: config.timeoutMs,
      });
    } catch (error) {
      throw classifyHttpError(error);
    }

    const root = response?.data || {};
    const data = root.data || root;
    const providerRunId = clean(data.workflow_run_id || root.workflow_run_id || data.id) || null;
    const workflowStatus = clean(data.status).toLowerCase() || null;
    if (workflowStatus && !['succeeded', 'success', 'completed', 'partial-succeeded'].includes(workflowStatus)) {
      throw providerError(
        clean(data.error) || `Dify Answer STT workflow ended with status ${workflowStatus}.`,
        'IIG_AI_STT_DIFY_WORKFLOW_FAILED',
        { retryable: true, providerRunId }
      );
    }

    let result;
    try {
      result = parseAnswerSttResult(root);
    } catch (error) {
      throw classifyHttpError(error);
    }

    return {
      provider: 'dify',
      providerRunId,
      taskId: clean(root.task_id || data.task_id) || null,
      workflowStatus,
      modelVersion: clean(modelVersion) || null,
      result,
      outcome: classifyAnswerSttOutcome(result),
      usage: extractUsage(root, data),
    };
  }

  return { transcribe };
}

const defaultClient = createIigAnswerSttClient();

module.exports = {
  DEFAULT_TIMEOUT_MS,
  DifyAnswerSttError,
  workflowEndpoint,
  validateProviderConfig,
  buildDifyInputs,
  extractUsage,
  classifyHttpError,
  createIigAnswerSttClient,
  transcribe: defaultClient.transcribe,
};
