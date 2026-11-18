const { AiCoreError } = require('../errors');

const EMPTY_USAGE = Object.freeze({ input: 0, cachedInput: 0, output: 0, thinking: 0 });

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function normalizeGeminiUsage(metadata = {}) {
  const cachedInput = nonNegativeInteger(metadata.cachedContentTokenCount);
  const prompt = nonNegativeInteger(metadata.promptTokenCount);
  const thinking = nonNegativeInteger(metadata.thoughtsTokenCount);
  return {
    input: Math.max(0, prompt - cachedInput),
    cachedInput,
    output: nonNegativeInteger(metadata.candidatesTokenCount) + thinking,
    thinking,
  };
}

function normalizeDeepSeekUsage(usage = {}) {
  const details = usage.completion_tokens_details || {};
  const cachedInput = nonNegativeInteger(
    usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens,
  );
  const explicitMiss = usage.prompt_cache_miss_tokens;
  const input = explicitMiss === undefined
    ? Math.max(0, nonNegativeInteger(usage.prompt_tokens) - cachedInput)
    : nonNegativeInteger(explicitMiss);
  return {
    input,
    cachedInput,
    output: nonNegativeInteger(usage.completion_tokens),
    thinking: nonNegativeInteger(details.reasoning_tokens),
  };
}

function normalizeUsage(provider, usage) {
  if (provider === 'gemini') return normalizeGeminiUsage(usage);
  if (provider === 'deepseek') return normalizeDeepSeekUsage(usage);
  return { ...EMPTY_USAGE };
}

function normalizeFinishReason(provider, reason) {
  const value = String(reason || '').toUpperCase();
  if (provider === 'gemini') {
    if (value === 'STOP') return 'stop';
    if (value === 'MAX_TOKENS') return 'length';
    if (value === 'SAFETY' || value === 'RECITATION') return 'safety';
    return 'other';
  }
  if (provider === 'deepseek') {
    if (value === 'STOP') return 'stop';
    if (value === 'LENGTH') return 'length';
  }
  return 'other';
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
  normalizeGeminiUsage,
  normalizeDeepSeekUsage,
  normalizeUsage,
  normalizeFinishReason,
  normalizeHttpError,
  providerErrorFromHttp,
  timeoutError,
  normalizeThrownError,
};
