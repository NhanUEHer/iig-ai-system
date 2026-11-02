const axios = require('axios');
const HttpError = require('../http/httpError');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function createAiScoringAdminClient(options = {}) {
  const http = options.http || axios;
  const config = {
    baseUrl: normalizeBaseUrl(options.baseUrl ?? process.env.AI_SCORING_ADMIN_URL),
    serviceToken: options.serviceToken ?? process.env.AI_SCORING_ADMIN_SERVICE_TOKEN,
    readTimeoutMs: positiveInteger(options.readTimeoutMs ?? process.env.AI_SCORING_ADMIN_READ_TIMEOUT_MS, 5000),
    writeTimeoutMs: positiveInteger(options.writeTimeoutMs ?? process.env.AI_SCORING_ADMIN_WRITE_TIMEOUT_MS, 10000),
    circuitFailureThreshold: positiveInteger(options.circuitFailureThreshold ?? process.env.AI_SCORING_ADMIN_CIRCUIT_FAILURE_THRESHOLD, 5),
    circuitResetMs: positiveInteger(options.circuitResetMs ?? process.env.AI_SCORING_ADMIN_CIRCUIT_RESET_MS, 30000),
  };
  let consecutiveFailures = 0;
  let circuitOpenedAt = 0;

  function assertConfigured() {
    if (!config.baseUrl || !config.serviceToken) {
      throw new HttpError('AI Scoring Admin API is not configured.', 503, 'AI_SCORING_ADMIN_NOT_CONFIGURED');
    }
  }

  function assertCircuitAvailable() {
    if (!circuitOpenedAt) return;
    if (Date.now() - circuitOpenedAt >= config.circuitResetMs) {
      circuitOpenedAt = 0;
      consecutiveFailures = 0;
      return;
    }
    throw new HttpError('AI Scoring Admin API is temporarily unavailable.', 503, 'AI_SCORING_ADMIN_CIRCUIT_OPEN');
  }

  function recordSuccess() {
    consecutiveFailures = 0;
    circuitOpenedAt = 0;
  }

  function recordFailure() {
    consecutiveFailures += 1;
    if (consecutiveFailures >= config.circuitFailureThreshold) circuitOpenedAt = Date.now();
  }

  function isRetryable(error) {
    if (!error.response) return true;
    return RETRYABLE_STATUS_CODES.has(error.response.status);
  }

  async function request({ method, path, query, body, headers = {} }) {
    assertConfigured();
    assertCircuitAvailable();
    const normalizedMethod = String(method || 'GET').toUpperCase();
    const safeMethod = SAFE_METHODS.has(normalizedMethod);
    const attempts = safeMethod ? 2 : 1;
    let lastError;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await http.request({
          method: normalizedMethod,
          url: `${config.baseUrl}/api/admin/v1${path.startsWith('/') ? path : `/${path}`}`,
          params: query,
          data: body,
          timeout: safeMethod ? config.readTimeoutMs : config.writeTimeoutMs,
          validateStatus: () => true,
          headers: {
            authorization: `Bearer ${config.serviceToken}`,
            accept: 'application/json',
            ...headers,
          },
        });
        if (response.status < 500) recordSuccess();
        else recordFailure();
        if (safeMethod && RETRYABLE_STATUS_CODES.has(response.status) && attempt + 1 < attempts) continue;
        return response;
      } catch (error) {
        lastError = error;
        recordFailure();
        if (attempt + 1 >= attempts || !isRetryable(error)) break;
      }
    }

    throw new HttpError(
      'AI Scoring Admin API request failed.',
      503,
      'AI_SCORING_ADMIN_UNAVAILABLE',
      { cause: lastError?.code || lastError?.message }
    );
  }

  return { request };
}

module.exports = { createAiScoringAdminClient };
