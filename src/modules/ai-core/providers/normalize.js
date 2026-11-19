// Shared toolkit for adapters: provider-neutral helpers only.
// Anything that knows a provider's field names lives in that provider's adapter.
const { AiCoreError } = require('../errors');

const EMPTY_USAGE = Object.freeze({ input: 0, cachedInput: 0, output: 0, thinking: 0 });

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function normalizeHttpError(status) {
  const httpStatus = Number(status);
  if (httpStatus === 401 || httpStatus === 403) {
    return { retryable: false, code: 'AUTH_FAILED' };
  }
  if (httpStatus === 408 || httpStatus === 504) {
    return { retryable: true, code: 'TIMEOUT' };
  }
  if (httpStatus === 429 || httpStatus === 500 || httpStatus === 503) {
    return { retryable: true, code: 'PROVIDER_DOWN' };
  }
  return { retryable: false, code: 'PROVIDER_DOWN' };
}

function providerErrorFromHttp(status, retryAfter) {
  const normalized = normalizeHttpError(status);
  const error = new AiCoreError(
    normalized.code,
    `Provider request failed (HTTP ${Number(status) || 'unknown'}).`,
  );
  error.retryable = normalized.retryable;
  if (retryAfter !== undefined && retryAfter !== null) error.retryAfter = retryAfter;
  return error;
}

function timeoutError() {
  return new AiCoreError('TIMEOUT', 'Provider request timed out.');
}

function normalizeThrownError(error, timedOut = false) {
  if (error instanceof AiCoreError) return error;
  if (timedOut || error?.name === 'AbortError') return timeoutError();
  const normalized = new AiCoreError('PROVIDER_DOWN', 'Provider request failed.');
  normalized.retryable = true;
  return normalized;
}

module.exports = {
  EMPTY_USAGE,
  nonNegativeInteger,
  normalizeHttpError,
  providerErrorFromHttp,
  timeoutError,
  normalizeThrownError,
};
