const HttpError = require('../../../http/httpError');

const PROVIDERS = new Set(['gemini', 'deepseek']);

function fail(message, code = 'AI_CORE_VALIDATION_FAILED', statusCode = 400, details) {
  throw new HttpError(message, statusCode, code, details);
}

function requiredString(value, field, { min = 1, max = 500 } = {}) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    fail(`${field} must contain ${min}-${max} characters.`, 'AI_CORE_INVALID_FIELD');
  }
  return value.trim();
}

function optionalHttpsUrl(value, field = 'baseUrl') {
  if (value === undefined || value === null || value === '') return value === undefined ? undefined : null;
  let url;
  try { url = new URL(value); } catch (_error) {
    fail(`${field} must be a valid HTTPS URL.`, 'AI_CORE_INVALID_URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    fail(`${field} must be a valid HTTPS URL.`, 'AI_CORE_INVALID_URL');
  }
  return url.toString().replace(/\/$/, '');
}

function provider(value) {
  if (!PROVIDERS.has(value)) fail('provider is not supported.', 'AI_CORE_INVALID_PROVIDER');
  return value;
}

function enumValue(value, field, allowed) {
  if (!allowed.includes(value)) fail(`${field} must be one of: ${allowed.join(', ')}.`, 'AI_CORE_INVALID_FIELD');
  return value;
}

function numberValue(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) {
    fail(`${field} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`, 'AI_CORE_INVALID_FIELD');
  }
  return parsed;
}

module.exports = {
  PROVIDERS, fail, requiredString, optionalHttpsUrl, provider, enumValue, numberValue,
};
