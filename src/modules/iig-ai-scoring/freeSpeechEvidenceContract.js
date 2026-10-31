const { getEvidenceContract, normalizedType } = require('./evidenceContractRegistry');

const FREE_SPEECH_EVIDENCE_SCHEMA_VERSION = 1;
const SUPPORTED_TYPES = Object.freeze([
  'DESCRIBE_PICTURE',
  'RESPOND_TO_QUESTIONS',
  'RESPOND_USING_INFORMATION',
  'EXPRESS_AN_OPINION',
]);
const STATUSES = Object.freeze(['SUCCESS', 'NO_SPEECH', 'WRONG_LANGUAGE', 'FAILED']);
const LISTENER_EFFORT = Object.freeze(['NONE', 'LITTLE', 'SOME', 'SIGNIFICANT', 'EXTREME']);

function failure(message, code) {
  return Object.assign(new Error(message), { code, retryable: false });
}

function record(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw failure(`${field} must be an object.`, 'IIG_AI_FREE_SPEECH_EVIDENCE_INVALID');
  }
  return value;
}

function text(value) {
  return String(value || '').normalize('NFKC').trim();
}

function number(value, field, minimum = 0, maximum = Infinity, nullable = false) {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw failure(`${field} is outside its accepted range.`, 'IIG_AI_FREE_SPEECH_EVIDENCE_INVALID');
  }
  return parsed;
}

function count(value, field) {
  const parsed = number(value, field);
  if (!Number.isInteger(parsed)) {
    throw failure(`${field} must be an integer.`, 'IIG_AI_FREE_SPEECH_EVIDENCE_INVALID');
  }
  return parsed;
}

function choice(value, field, accepted) {
  const normalized = text(value).toUpperCase();
  if (!accepted.includes(normalized)) {
    throw failure(`${field} contains an unsupported value.`, 'IIG_AI_FREE_SPEECH_EVIDENCE_INVALID');
  }
  return normalized;
}

function buildFreeSpeechEvidenceRequest({ aiInput, transcript }) {
  const question = record(aiInput?.question, 'aiInput.question');
  const response = record(aiInput?.response, 'aiInput.response');
  const scorerType = normalizedType(question.scorerType);
  if (!SUPPORTED_TYPES.includes(scorerType)) {
    throw failure('The scorer type does not use free-speech evidence.', 'IIG_AI_FREE_SPEECH_TYPE_UNSUPPORTED');
  }
  if (response.type !== 'audio' || !response.audio) {
    throw failure('Free-speech evidence requires prepared audio.', 'IIG_AI_FREE_SPEECH_AUDIO_REQUIRED');
  }
  const normalizedTranscript = text(transcript);
  if (!normalizedTranscript) {
    throw failure('Free-speech evidence requires a transcript.', 'IIG_AI_FREE_SPEECH_TRANSCRIPT_REQUIRED');
  }
  const evidenceContract = getEvidenceContract(scorerType);
  return {
    schema_version: FREE_SPEECH_EVIDENCE_SCHEMA_VERSION,
    contract_version: evidenceContract.contractVersion,
    task_profile: evidenceContract.taskProfile,
    transcript: normalizedTranscript,
    audio: {
      duration_seconds: response.audio.durationSeconds ?? null,
      checksum_sha256: text(response.audio.checksumSha256) || null,
    },
  };
}

function normalizeFreeSpeechEvidence(scorerType, value) {
  const type = normalizedType(scorerType);
  if (!SUPPORTED_TYPES.includes(type)) {
    throw failure('The scorer type does not use free-speech evidence.', 'IIG_AI_FREE_SPEECH_TYPE_UNSUPPORTED');
  }
  const evidenceContract = getEvidenceContract(type);
  const payload = record(value, 'speechEvidence');
  if (number(payload.schema_version, 'schema_version', 1) !== FREE_SPEECH_EVIDENCE_SCHEMA_VERSION) {
    throw failure('Free-speech evidence schema is incompatible.', 'IIG_AI_FREE_SPEECH_SCHEMA_UNSUPPORTED');
  }
  if (text(payload.contract_version) !== evidenceContract.contractVersion) {
    throw failure('Free-speech evidence contract is incompatible.', 'IIG_AI_FREE_SPEECH_CONTRACT_MISMATCH');
  }
  const status = choice(payload.status, 'status', STATUSES);
  const validity = record(payload.validity, 'validity');
  const normalizedValidity = {
    speechPresent: typeof validity.speech_present === 'boolean' ? validity.speech_present : false,
    languageCode: text(validity.language_code).toLowerCase() || null,
    intelligibleSpeech: typeof validity.intelligible_speech === 'boolean'
      ? validity.intelligible_speech
      : false,
  };
  if (status !== 'SUCCESS') {
    return {
      schemaVersion: FREE_SPEECH_EVIDENCE_SCHEMA_VERSION,
      contractVersion: evidenceContract.contractVersion,
      status,
      validity: normalizedValidity,
      delivery: null,
      fluency: null,
      flags: Array.isArray(payload.flags) ? payload.flags.map(text).filter(Boolean) : [],
    };
  }
  if (!normalizedValidity.speechPresent || normalizedValidity.languageCode !== 'en') {
    throw failure('Successful evidence must contain English speech.', 'IIG_AI_FREE_SPEECH_EVIDENCE_CONTRADICTORY');
  }
  const delivery = record(payload.delivery, 'delivery');
  const fluency = record(payload.fluency || {}, 'fluency');
  return {
    schemaVersion: FREE_SPEECH_EVIDENCE_SCHEMA_VERSION,
    contractVersion: evidenceContract.contractVersion,
    status,
    validity: normalizedValidity,
    delivery: {
      intelligibility: number(delivery.intelligibility, 'delivery.intelligibility', 0, 1, true),
      listenerEffort: choice(delivery.listener_effort, 'delivery.listener_effort', LISTENER_EFFORT),
      pronunciationAccuracy: number(delivery.pronunciation_accuracy, 'delivery.pronunciation_accuracy', 0, 1, true),
      stressAppropriateness: number(delivery.stress_appropriateness, 'delivery.stress_appropriateness', 0, 1, true),
      pauseAppropriateness: number(delivery.pause_appropriateness, 'delivery.pause_appropriateness', 0, 1, true),
      pitchAppropriateness: number(delivery.pitch_appropriateness, 'delivery.pitch_appropriateness', 0, 1, true),
      rhythmAppropriateness: number(delivery.rhythm_appropriateness, 'delivery.rhythm_appropriateness', 0, 1, true),
    },
    fluency: {
      speechRateWpm: number(fluency.speech_rate_wpm, 'fluency.speech_rate_wpm', 0, Infinity, true),
      fillerCount: count(fluency.filler_count ?? 0, 'fluency.filler_count'),
      repetitionCount: count(fluency.repetition_count ?? 0, 'fluency.repetition_count'),
      longestPauseMs: number(fluency.longest_pause_ms, 'fluency.longest_pause_ms', 0, Infinity, true),
    },
    flags: Array.isArray(payload.flags) ? payload.flags.map(text).filter(Boolean) : [],
  };
}

module.exports = {
  FREE_SPEECH_EVIDENCE_SCHEMA_VERSION,
  SUPPORTED_TYPES,
  STATUSES,
  LISTENER_EFFORT,
  buildFreeSpeechEvidenceRequest,
  normalizeFreeSpeechEvidence,
};
