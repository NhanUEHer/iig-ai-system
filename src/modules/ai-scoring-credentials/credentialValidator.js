const HttpError = require('../../http/httpError');

function invalid(message, field) {
  return new HttpError(message, 422, 'CREDENTIAL_VALIDATION_FAILED', { field });
}

function normalizeScopes(value) {
  if (!Array.isArray(value) || !value.length) throw invalid('Chọn ít nhất một scope.', 'scopes');
  const scopes = [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))];
  if (!scopes.length || scopes.some(scope => !/^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/.test(scope))) {
    throw invalid('Scope credential không hợp lệ.', 'scopes');
  }
  return scopes;
}

function expiry(value) {
  if (value == null || value === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed <= new Date()) throw invalid('Ngày hết hạn phải ở tương lai.', 'expiresAt');
  return parsed.toISOString();
}

function createInput(body = {}) {
  const name = String(body.name || '').trim();
  if (name.length < 2 || name.length > 160) throw invalid('Tên credential phải từ 2 đến 160 ký tự.', 'name');
  return { name, scopes: normalizeScopes(body.scopes), expiresAt: expiry(body.expiresAt) };
}

function updateInput(body = {}) { return createInput(body); }

function reason(body = {}) {
  const value = String(body.reason || '').trim();
  if (value.length < 3 || value.length > 500) throw invalid('Lý do phải từ 3 đến 500 ký tự.', 'reason');
  return value;
}

function rotateInput(body = {}) {
  const overlapMinutes = Number(body.overlapMinutes ?? 15);
  if (!Number.isInteger(overlapMinutes) || overlapMinutes < 0 || overlapMinutes > 1440) {
    throw invalid('Thời gian chuyển đổi phải từ 0 đến 1.440 phút.', 'overlapMinutes');
  }
  return { reason: reason(body), overlapMinutes };
}

module.exports = { createInput, updateInput, reason, rotateInput, normalizeScopes };
