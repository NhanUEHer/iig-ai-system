const SCORING_DISPOSITIONS = Object.freeze({
  NORMAL: 'NORMAL',
  ZERO_CANDIDATE: 'ZERO_CANDIDATE',
  ZERO_RESPONSE_QUALITY: 'ZERO_RESPONSE_QUALITY',
  ZERO_SOURCE_DATA: 'ZERO_SOURCE_DATA',
  INVALID_PROMPT_SOURCE: 'INVALID_PROMPT_SOURCE',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
});

const ZERO_ORIGINS = Object.freeze({
  CANDIDATE: 'CANDIDATE',
  RESPONSE_QUALITY: 'RESPONSE_QUALITY',
  SOURCE_DATA: 'SOURCE_DATA',
  SYSTEM: 'SYSTEM',
});

const MEDIA_FAILURE_CLASSES = Object.freeze({
  TRANSIENT: 'TRANSIENT',
  PERMANENT_NOT_FOUND: 'PERMANENT_NOT_FOUND',
  PERMANENT_ACCESS_DENIED: 'PERMANENT_ACCESS_DENIED',
  INVALID_CONTENT: 'INVALID_CONTENT',
  RETRY_EXHAUSTED: 'RETRY_EXHAUSTED',
  SYSTEM_FAILURE: 'SYSTEM_FAILURE',
});

const SYSTEM_MEDIA_CODES = new Set([
  'IIG_MEDIA_DNS_TEMPORARY',
  'IIG_MEDIA_DNS_NOT_FOUND',
  'IIG_MEDIA_NETWORK_TIMEOUT',
  'IIG_MEDIA_NETWORK_FAILURE',
  'IIG_MEDIA_PROCESSING_FAILED',
]);

function mediaFailureClassification(error, { retryExhausted = false } = {}) {
  const code = String(error?.code || 'IIG_MEDIA_PROCESSING_FAILED').trim().toUpperCase();
  if (['IIG_MEDIA_HTTP_404', 'IIG_MEDIA_HTTP_410', 'IIG_MEDIA_NOT_FOUND',
    'IIG_MEDIA_SOURCE_MISSING'].includes(code)) {
    return {
      failureOrigin: ZERO_ORIGINS.SOURCE_DATA,
      failureClass: MEDIA_FAILURE_CLASSES.PERMANENT_NOT_FOUND,
      retryExhausted,
    };
  }
  if (code === 'IIG_MEDIA_HTTP_401' || code === 'IIG_MEDIA_HTTP_403') {
    return {
      failureOrigin: ZERO_ORIGINS.SOURCE_DATA,
      failureClass: MEDIA_FAILURE_CLASSES.PERMANENT_ACCESS_DENIED,
      retryExhausted,
    };
  }
  if (SYSTEM_MEDIA_CODES.has(code) || /^IIG_MEDIA_HTTP_5\d\d$/.test(code)) {
    return {
      failureOrigin: ZERO_ORIGINS.SYSTEM,
      failureClass: MEDIA_FAILURE_CLASSES.SYSTEM_FAILURE,
      retryExhausted,
    };
  }
  if (retryExhausted) {
    return {
      failureOrigin: ZERO_ORIGINS.SYSTEM,
      failureClass: MEDIA_FAILURE_CLASSES.SYSTEM_FAILURE,
      retryExhausted: true,
    };
  }
  if (code.includes('TYPE_INVALID') || code.includes('TOO_LARGE') || code.includes('INVALID_AUDIO')) {
    return {
      failureOrigin: ZERO_ORIGINS.SOURCE_DATA,
      failureClass: MEDIA_FAILURE_CLASSES.INVALID_CONTENT,
      retryExhausted: false,
    };
  }
  if (error?.retryable) {
    return {
      failureOrigin: ZERO_ORIGINS.SYSTEM,
      failureClass: MEDIA_FAILURE_CLASSES.TRANSIENT,
      retryExhausted: false,
    };
  }
  return {
    failureOrigin: ZERO_ORIGINS.SYSTEM,
    failureClass: MEDIA_FAILURE_CLASSES.SYSTEM_FAILURE,
    retryExhausted: false,
  };
}

function studentAudioSourceReason(failureClass) {
  if (failureClass === MEDIA_FAILURE_CLASSES.PERMANENT_NOT_FOUND) return 'SOURCE_AUDIO_NOT_FOUND';
  if (failureClass === MEDIA_FAILURE_CLASSES.PERMANENT_ACCESS_DENIED) return 'SOURCE_AUDIO_ACCESS_DENIED';
  if (failureClass === MEDIA_FAILURE_CLASSES.RETRY_EXHAUSTED) return 'SOURCE_AUDIO_FETCH_EXHAUSTED';
  if (failureClass === MEDIA_FAILURE_CLASSES.INVALID_CONTENT) return 'AUDIO_CORRUPTED';
  return 'SOURCE_AUDIO_FETCH_EXHAUSTED';
}

function resolution({
  scoringDisposition = SCORING_DISPOSITIONS.NORMAL,
  zeroReason = null,
  zeroOrigin = null,
  metadata = {},
} = {}) {
  return { scoringDisposition, zeroReason, zeroOrigin, metadata };
}

module.exports = {
  SCORING_DISPOSITIONS,
  ZERO_ORIGINS,
  MEDIA_FAILURE_CLASSES,
  SYSTEM_MEDIA_CODES,
  mediaFailureClassification,
  studentAudioSourceReason,
  resolution,
};
