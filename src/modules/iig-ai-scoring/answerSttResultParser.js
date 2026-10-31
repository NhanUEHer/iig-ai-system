const {
  ANSWER_STT_OUTPUT_SCHEMA_VERSION,
  STT_OUTPUT_STATUSES,
} = require('./answerSttContract');

const STATUS_SET = new Set(STT_OUTPUT_STATUSES);
const RESULT_KEYS = ['stt_result', 'result', 'output', 'text'];
const ERROR_TRANSCRIPT_PATTERNS = [
  /audio không có giọng nói/i,
  /đoạn ghi âm không đúng yêu cầu/i,
  /phát hiện thí sinh nói tiếng/i,
  /^no speech(?: detected)?[.!]?$/i,
  /^wrong language[.!]?$/i,
  /^failed[.!]?$/i,
];

class AnswerSttOutputError extends Error {
  constructor(message, code, retryable = true) {
    super(message);
    this.name = 'AnswerSttOutputError';
    this.code = code;
    this.retryable = retryable;
  }
}

function outputError(message, code, retryable = true) {
  return new AnswerSttOutputError(message, code, retryable);
}

function extractCodeFence(value) {
  const trimmed = String(value || '').trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function parseJsonString(value) {
  const cleaned = extractCodeFence(value);
  if (!cleaned) {
    throw outputError('Answer STT returned an empty output.', 'IIG_AI_STT_OUTPUT_EMPTY');
  }
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch (_) {}
    }
    throw outputError('Answer STT did not return valid JSON.', 'IIG_AI_STT_OUTPUT_JSON_INVALID');
  }
}

function unwrapDifyOutput(raw) {
  let candidate = raw?.data?.outputs ?? raw?.outputs ?? raw;
  if (typeof candidate === 'string') return parseJsonString(candidate);
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw outputError('Answer STT output must be an object or JSON string.', 'IIG_AI_STT_OUTPUT_INVALID');
  }
  if (Object.hasOwn(candidate, 'schema_version') && Object.hasOwn(candidate, 'status')) {
    return candidate;
  }
  for (const key of RESULT_KEYS) {
    if (!Object.hasOwn(candidate, key)) continue;
    const value = candidate[key];
    if (typeof value === 'string') return parseJsonString(value);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  }
  const objectValues = Object.values(candidate)
    .filter(value => value && typeof value === 'object' && !Array.isArray(value));
  if (objectValues.length === 1) return objectValues[0];
  const stringValues = Object.values(candidate).filter(value => typeof value === 'string' && value.trim());
  if (stringValues.length === 1) return parseJsonString(stringValues[0]);
  throw outputError(
    'Answer STT outputs do not contain a unique result payload.',
    'IIG_AI_STT_OUTPUT_AMBIGUOUS'
  );
}

function normalizeConfidence(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw outputError(
      'Answer STT confidence must be a number from 0 to 1.',
      'IIG_AI_STT_CONFIDENCE_INVALID'
    );
  }
  return value;
}

function normalizeFlags(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some(flag => typeof flag !== 'string')) {
    throw outputError('Answer STT flags must be an array of strings.', 'IIG_AI_STT_FLAGS_INVALID');
  }
  return [...new Set(value.map(flag => flag.trim().toUpperCase()).filter(Boolean))];
}

function normalizeBoolean(value, field, fallback = undefined) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    if (!normalized && typeof fallback === 'boolean') return fallback;
  }
  if ((value === null || value === undefined) && typeof fallback === 'boolean') return fallback;
  throw outputError(
    `Answer STT ${field} must be a boolean.`,
    'IIG_AI_STT_SPEECH_FLAG_INVALID'
  );
}

function hasErrorTranscript(value) {
  return ERROR_TRANSCRIPT_PATTERNS.some(pattern => pattern.test(value));
}

function validateStatusFields(payload) {
  const schemaVersion = payload.schema_version;
  if (schemaVersion !== ANSWER_STT_OUTPUT_SCHEMA_VERSION) {
    throw outputError(
      `Unsupported Answer STT output schema version: ${schemaVersion}.`,
      'IIG_AI_STT_SCHEMA_UNSUPPORTED',
      false
    );
  }
  const status = String(payload.status || '').trim().toUpperCase();
  if (!STATUS_SET.has(status)) {
    throw outputError(`Unsupported Answer STT status: ${status || '(empty)'}.`, 'IIG_AI_STT_STATUS_INVALID');
  }
  const inferredSpeechDetected = status === 'NO_SPEECH' || status === 'FAILED' ? false : true;
  const speechDetected = normalizeBoolean(
    payload.speech_detected,
    'speech_detected',
    inferredSpeechDetected
  );

  const transcript = String(payload.transcript || '').trim();
  if (status === 'SUCCESS' && !transcript) {
    throw outputError('Successful Answer STT output has no transcript.', 'IIG_AI_STT_TRANSCRIPT_MISSING');
  }
  if (status === 'SUCCESS' && hasErrorTranscript(transcript)) {
    throw outputError(
      'Answer STT placed an error message in the transcript field.',
      'IIG_AI_STT_ERROR_AS_TRANSCRIPT'
    );
  }
  if (status === 'SUCCESS' && speechDetected !== true) {
    throw outputError(
      'Successful Answer STT output must mark speech as detected.',
      'IIG_AI_STT_SPEECH_FLAG_CONFLICT'
    );
  }
  if (status === 'NO_SPEECH' && (transcript || speechDetected !== false)) {
    throw outputError(
      'NO_SPEECH must have an empty transcript and speech_detected=false.',
      'IIG_AI_STT_NO_SPEECH_CONFLICT'
    );
  }
  if (status === 'FAILED' && transcript) {
    throw outputError('FAILED output must not contain a transcript.', 'IIG_AI_STT_FAILED_TRANSCRIPT_CONFLICT');
  }

  const detectedLanguage = payload.detected_language == null
    ? null
    : String(payload.detected_language).trim().toLowerCase() || null;
  if (status === 'WRONG_LANGUAGE_VI' && detectedLanguage && detectedLanguage !== 'vi') {
    throw outputError(
      'WRONG_LANGUAGE_VI conflicts with detected_language.',
      'IIG_AI_STT_LANGUAGE_CONFLICT'
    );
  }
  if (status === 'SUCCESS' && detectedLanguage && !detectedLanguage.startsWith('en')) {
    throw outputError(
      'SUCCESS requires English or an unspecified detected language.',
      'IIG_AI_STT_LANGUAGE_CONFLICT'
    );
  }

  return {
    schemaVersion,
    status,
    transcript,
    detectedLanguage,
    speechDetected,
    confidence: normalizeConfidence(payload.confidence),
    flags: normalizeFlags(payload.flags),
  };
}

function parseAnswerSttResult(raw) {
  return validateStatusFields(unwrapDifyOutput(raw));
}

function classifyAnswerSttOutcome(result) {
  switch (result.status) {
    case 'SUCCESS':
      return { action: 'CONTINUE', retryable: false, terminal: true };
    case 'NO_SPEECH':
      return { action: 'INVALID_AUDIO', retryable: false, terminal: true };
    case 'WRONG_LANGUAGE_VI':
    case 'WRONG_LANGUAGE_OTHER':
    case 'UNINTELLIGIBLE':
      return { action: 'REVIEW_REQUIRED', retryable: false, terminal: true };
    case 'FAILED':
      return { action: 'RETRY', retryable: true, terminal: false };
    default:
      throw outputError('Cannot classify an unknown Answer STT status.', 'IIG_AI_STT_STATUS_INVALID');
  }
}

module.exports = {
  AnswerSttOutputError,
  RESULT_KEYS,
  extractCodeFence,
  unwrapDifyOutput,
  parseAnswerSttResult,
  classifyAnswerSttOutcome,
};
