const { createHash } = require('node:crypto');

class SourcePayloadError extends Error {
  constructor(message, code, retryable = false) {
    super(message);
    this.name = 'SourcePayloadError';
    this.code = code;
    this.retryable = retryable;
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function payloadHash(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function responseItems(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  return null;
}

function validateBatchDetail(response, { scoringId, keycode }) {
  const items = responseItems(response);
  if (!items) {
    throw new SourcePayloadError(
      'IIG batch detail returned an invalid response container.',
      'IIG_BATCH_DETAIL_INVALID'
    );
  }

  const item = items.find(candidate =>
    String(candidate?.mockTestScoringInfo?.id || '').toLowerCase() === scoringId.toLowerCase()
  );
  if (!item) {
    throw new SourcePayloadError(
      'IIG batch detail did not contain the requested scoring ID.',
      'IIG_SCORING_NOT_FOUND'
    );
  }

  const info = item.mockTestScoringInfo || {};
  const returnedKeycode = String(info.keyCode || '').trim().toUpperCase();
  if (returnedKeycode !== keycode) {
    throw new SourcePayloadError(
      'The IIG scoring record belongs to a different keycode.',
      'IIG_KEYCODE_MISMATCH'
    );
  }
  if (!String(info.mockTestId || '').trim()) {
    throw new SourcePayloadError(
      'The IIG scoring record does not contain a mockTestId.',
      'IIG_MOCK_TEST_ID_MISSING'
    );
  }
  if (!Array.isArray(item.groupScorings)) {
    throw new SourcePayloadError(
      'The IIG scoring record does not contain score groups.',
      'IIG_SCORE_GROUPS_INVALID'
    );
  }
  if (!Array.isArray(item.questions) || !item.questions.length) {
    throw new SourcePayloadError(
      'The IIG scoring record does not contain questions.',
      'IIG_QUESTIONS_INVALID'
    );
  }

  return {
    payload: item,
    payloadHash: payloadHash(item),
    mockTestId: String(info.mockTestId),
    questionCount: item.questions.length,
  };
}

function classifySourceError(error) {
  if (error instanceof SourcePayloadError) return error;
  if (error?.code && typeof error?.retryable === 'boolean') {
    const wrapped = new SourcePayloadError(
      error.message || 'IIG source request failed.',
      String(error.code),
      error.retryable
    );
    wrapped.cause = error;
    return wrapped;
  }
  const status = Number(error?.response?.status || 0);
  const retryable = !status || status === 408 ||
    status === 425 || status === 429 || status >= 500;
  const wrapped = new SourcePayloadError(
    status ? `IIG batch detail request failed with HTTP ${status}.` : 'IIG batch detail request failed.',
    status ? `IIG_HTTP_${status}` : 'IIG_SOURCE_UNAVAILABLE',
    retryable
  );
  wrapped.cause = error;
  return wrapped;
}

module.exports = {
  SourcePayloadError,
  stableStringify,
  payloadHash,
  validateBatchDetail,
  classifySourceError,
};
