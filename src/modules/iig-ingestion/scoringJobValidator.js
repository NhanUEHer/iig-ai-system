const HttpError = require('../../http/httpError');

const KEYCODE_PATTERN = /^[A-Z0-9]{6,20}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_FIELDS = new Set(['keycode', 'scoringId']);

function normalizeIdempotencyKey(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim();
  if (normalized.length < 8 || normalized.length > 128) {
    throw new HttpError(
      'Idempotency-Key must contain between 8 and 128 characters.',
      400,
      'IDEMPOTENCY_KEY_INVALID'
    );
  }
  return normalized;
}

function validateCreateRequest(body, idempotencyKey) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError('Request body must be a JSON object.', 400, 'REQUEST_BODY_INVALID');
  }

  const unknownFields = Object.keys(body).filter(field => !ALLOWED_FIELDS.has(field));
  if (unknownFields.length) {
    throw new HttpError(
      'Request body contains unsupported fields.',
      400,
      'REQUEST_BODY_INVALID',
      { unknownFields }
    );
  }

  const keycode = String(body.keycode || '').trim().toUpperCase();
  if (!KEYCODE_PATTERN.test(keycode)) {
    throw new HttpError(
      'The keycode must contain 6-20 ASCII letters or digits.',
      400,
      'KEYCODE_INVALID'
    );
  }

  const scoringId = String(body.scoringId || '').trim().toLowerCase();
  if (!UUID_PATTERN.test(scoringId)) {
    throw new HttpError('The scoringId must be a valid UUID.', 400, 'SCORING_ID_INVALID');
  }

  return {
    keycode,
    scoringId,
    idempotencyKey: normalizeIdempotencyKey(idempotencyKey),
  };
}

function validateJobId(value) {
  const jobId = String(value || '').trim().toLowerCase();
  if (!UUID_PATTERN.test(jobId)) {
    throw new HttpError('The job ID must be a valid UUID.', 400, 'SCORING_JOB_ID_INVALID');
  }
  return jobId;
}

function validateRetryRequest(body, idempotencyKey) {
  if (body === undefined || body === null) body = {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError('Retry request body must be a JSON object.', 400, 'RETRY_REQUEST_INVALID');
  }
  const unknownFields = Object.keys(body).filter(field => field !== 'reason');
  if (unknownFields.length) {
    throw new HttpError(
      'Retry request contains unsupported fields.',
      400,
      'RETRY_REQUEST_INVALID',
      { unknownFields }
    );
  }
  const reason = String(body.reason || '').trim();
  if (reason.length > 500) {
    throw new HttpError('Retry reason must not exceed 500 characters.', 400, 'RETRY_REASON_INVALID');
  }
  const normalizedKey = normalizeIdempotencyKey(idempotencyKey);
  if (!normalizedKey) {
    throw new HttpError('Idempotency-Key is required for retry requests.', 400, 'IDEMPOTENCY_KEY_REQUIRED');
  }
  return { reason: reason || null, idempotencyKey: normalizedKey };
}

module.exports = {
  KEYCODE_PATTERN,
  UUID_PATTERN,
  validateCreateRequest,
  validateJobId,
  validateRetryRequest,
  normalizeIdempotencyKey,
};
