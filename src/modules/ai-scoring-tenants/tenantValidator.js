const HttpError = require('../../http/httpError');

const ENVIRONMENTS = ['PRODUCTION', 'BETA', 'DEVELOPMENT'];
const STATUSES = ['ACTIVE', 'SUSPENDED', 'DISABLED'];
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,39}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(message, field) {
  throw new HttpError(message, 400, 'TENANT_VALIDATION_FAILED', { field });
}

function text(value, field, { required = false, max = 200 } = {}) {
  const normalized = value === null || value === undefined ? '' : String(value).trim();
  if (required && !normalized) fail(`${field} là bắt buộc.`, field);
  if (normalized.length > max) fail(`${field} không được vượt quá ${max} ký tự.`, field);
  return normalized || null;
}

function normalizeCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) {
    fail('Code phải dài 3–40 ký tự, bắt đầu bằng chữ và chỉ gồm A-Z, 0-9 hoặc dấu gạch dưới.', 'code');
  }
  return code;
}

function normalizeEnvironment(value) {
  const environment = String(value || 'PRODUCTION').trim().toUpperCase();
  if (!ENVIRONMENTS.includes(environment)) fail('Environment không hợp lệ.', 'environment');
  return environment;
}

function normalizeScopes(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail('allowedScopes phải là một mảng.', 'allowedScopes');
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))];
}

function normalizeRateLimit(value) {
  const rateLimit = Number(value === undefined ? 120 : value);
  if (!Number.isInteger(rateLimit) || rateLimit < 1 || rateLimit > 100000) {
    fail('Rate limit phải là số nguyên từ 1 đến 100.000.', 'rateLimit');
  }
  return rateLimit;
}

function normalizeMetadata(value) {
  if (value === undefined) return {};
  if (!value || Array.isArray(value) || typeof value !== 'object') fail('metadata phải là object.', 'metadata');
  return value;
}

function normalizeContactEmail(value) {
  const email = text(value, 'contactEmail', { max: 320 });
  if (email && !EMAIL_PATTERN.test(email)) fail('Email liên hệ không hợp lệ.', 'contactEmail');
  return email;
}

function createInput(body = {}) {
  return {
    code: normalizeCode(body.code),
    name: text(body.name, 'name', { required: true, max: 200 }),
    environment: normalizeEnvironment(body.environment),
    contactName: text(body.contactName, 'contactName', { max: 160 }),
    contactEmail: normalizeContactEmail(body.contactEmail),
    allowedScopes: normalizeScopes(body.allowedScopes),
    rateLimit: normalizeRateLimit(body.rateLimit),
    metadata: normalizeMetadata(body.metadata),
  };
}

function updateInput(body = {}) {
  if (Object.prototype.hasOwnProperty.call(body, 'code')) {
    throw new HttpError('Code tenant không thể thay đổi sau khi tạo.', 422, 'TENANT_CODE_IMMUTABLE');
  }
  return {
    name: text(body.name, 'name', { required: true, max: 200 }),
    environment: normalizeEnvironment(body.environment),
    contactName: text(body.contactName, 'contactName', { max: 160 }),
    contactEmail: normalizeContactEmail(body.contactEmail),
    allowedScopes: normalizeScopes(body.allowedScopes),
    rateLimit: normalizeRateLimit(body.rateLimit),
    metadata: normalizeMetadata(body.metadata),
  };
}

function listInput(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 25));
  const status = query.status ? String(query.status).toUpperCase() : null;
  const environment = query.environment ? String(query.environment).toUpperCase() : null;
  if (status && !STATUSES.includes(status)) fail('Trạng thái tenant không hợp lệ.', 'status');
  if (environment && !ENVIRONMENTS.includes(environment)) fail('Environment không hợp lệ.', 'environment');
  return { page, pageSize, search: String(query.search || '').trim().slice(0, 120), status, environment };
}

function statusReason(body = {}) {
  return text(body.reason, 'reason', { required: true, max: 1000 });
}

module.exports = { ENVIRONMENTS, STATUSES, createInput, updateInput, listInput, statusReason };
