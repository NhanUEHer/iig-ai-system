const TERMINAL_INGESTION_FAILURES = new Set([
  'INVALID_REQUEST',
  'SOURCE_FETCH_FAILED',
  'MEDIA_FAILED',
  'INVALID_INPUT',
  'FAILED',
]);

const IIG_INPUT_CODES = new Set([
  'IIG_BATCH_DETAIL_INVALID',
  'IIG_SCORING_NOT_FOUND',
  'IIG_KEYCODE_MISMATCH',
  'IIG_MOCK_TEST_ID_MISSING',
  'IIG_SCORE_GROUPS_INVALID',
  'IIG_QUESTIONS_INVALID',
]);

function clean(value) {
  return String(value || '').trim();
}

function stageFromStatus(status) {
  const normalized = clean(status).toUpperCase();
  if (['ACCEPTED', 'FETCHING_SOURCE', 'SOURCE_FETCH_FAILED'].includes(normalized)) return 'SOURCE_FETCH';
  if (['SYNCING_EXAM'].includes(normalized)) return 'SOURCE_SYNC';
  if (['PREPARING_MEDIA', 'MEDIA_FAILED'].includes(normalized)) return 'MEDIA_PREPARATION';
  if (['VALIDATING', 'INVALID_INPUT'].includes(normalized)) return 'INPUT_VALIDATION';
  if (['READY_FOR_AI', 'AI_SCORING'].includes(normalized)) return 'AI_SCORING';
  return 'SYSTEM';
}

function stageFromEvent(eventType, fallbackStatus) {
  const value = clean(eventType).toUpperCase();
  if (value.includes('SOURCE_FETCH')) return 'SOURCE_FETCH';
  if (value.includes('SOURCE_SYNC')) return 'SOURCE_SYNC';
  if (value.includes('MEDIA')) return 'MEDIA_PREPARATION';
  if (value.includes('VALIDATION')) return 'INPUT_VALIDATION';
  if (value.includes('TRANSCRIPTION')) return 'TRANSCRIPTION';
  if (value.includes('FEATURE')) return 'FEATURE_EXTRACTION';
  if (value.includes('GROUP')) return 'GROUP_SCORING';
  if (value.includes('SCORING')) return 'QUESTION_SCORING';
  return stageFromStatus(fallbackStatus);
}

function originFor(code, stage) {
  const value = clean(code).toUpperCase();
  if (['IIG_HTTP_401', 'IIG_HTTP_403'].includes(value)) return 'SYSTEM_CONFIG';
  if (IIG_INPUT_CODES.has(value) || value.startsWith('IIG_HTTP_4')) return 'IIG_SOURCE';
  if (value.includes('DIFY_AUTH') || value.includes('CONFIG_INVALID') || value.includes('CONFIG_MISSING')) {
    return 'SYSTEM_CONFIG';
  }
  if (value.includes('DIFY') || value.includes('PROVIDER') || value.includes('MODEL_')) {
    return 'AI_PROVIDER';
  }
  if (stage === 'INPUT_VALIDATION' || value.includes('INPUT_MISSING') || value.includes('MEDIA_MISSING')) {
    return 'IIG_INPUT';
  }
  if (value.startsWith('IIG_HTTP_') || value.includes('UNAVAILABLE')
      || value.includes('TIMEOUT') || value.includes('_DNS_') || value.includes('_NETWORK_')) {
    return 'EXTERNAL_DEPENDENCY';
  }
  return 'INTERNAL_SYSTEM';
}

function publicMessage(code, fallback, origin) {
  const value = clean(code).toUpperCase();
  if (origin === 'IIG_SOURCE' || origin === 'IIG_INPUT') {
    return clean(fallback) || 'The source submission data is incomplete or invalid.';
  }
  if (origin === 'SYSTEM_CONFIG') return 'The scoring service configuration requires operator attention.';
  if (origin === 'AI_PROVIDER' || origin === 'EXTERNAL_DEPENDENCY') {
    return value.includes('AUTH')
      ? 'An external scoring service rejected its configured credentials.'
      : 'An external scoring dependency could not complete the request.';
  }
  return 'The scoring system could not complete this processing stage.';
}

function recommendedAction({ origin, retryable, terminal }) {
  if (retryable && !terminal) return 'WAIT_FOR_AUTO_RETRY';
  if (origin === 'IIG_SOURCE' || origin === 'IIG_INPUT') return 'FIX_SOURCE_DATA_AND_RETRY';
  if (origin === 'SYSTEM_CONFIG') return 'FIX_CONFIGURATION_AND_RETRY';
  if (origin === 'AI_PROVIDER' || origin === 'EXTERNAL_DEPENDENCY') return 'RETRY_OR_CONTACT_SUPPORT';
  return 'CONTACT_SYSTEM_SUPPORT';
}

function normalizeFailure(input = {}) {
  const code = clean(input.code) || 'SCORING_FAILED';
  const stage = input.stage || stageFromEvent(input.eventType, input.status);
  const origin = input.origin || originFor(code, stage);
  const terminal = Boolean(input.terminal);
  const retryable = Boolean(input.retryable);
  return {
    origin,
    stage,
    scope: input.scope || 'JOB',
    questionId: input.questionId || null,
    groupCode: input.groupCode || null,
    code,
    message: publicMessage(code, input.message, origin),
    retryable,
    terminal,
    recommendedAction: recommendedAction({ origin, retryable, terminal }),
  };
}

function isTerminalFailure(job) {
  return TERMINAL_INGESTION_FAILURES.has(clean(job?.status).toUpperCase())
    || clean(job?.ai_scoring_status).toUpperCase() === 'FAILED';
}

module.exports = {
  TERMINAL_INGESTION_FAILURES,
  stageFromStatus,
  stageFromEvent,
  originFor,
  normalizeFailure,
  isTerminalFailure,
};
