const {
  profileForScorerType,
  responseProfile,
  validateQuestion,
} = require('./extendedSpeakingProfiles');

const SCORE_MIN = 0;
const SCORE_MAX = 3;
const RAW_SCORE_TRANSPORT_TOLERANCE = 0.0005;
const ZERO_REASONS = new Set([
  'ANSWER_NOT_PROVIDED',
  'AUDIO_TOO_SHORT',
  'AUDIO_NO_SIGNAL',
  'AUDIO_CORRUPTED',
  'SOURCE_AUDIO_NOT_FOUND',
  'SOURCE_AUDIO_ACCESS_DENIED',
  'SOURCE_AUDIO_FETCH_EXHAUSTED',
  'PROMPT_TEXT_NOT_FOUND',
  'CONTEXT_NOT_FOUND',
  'CONTEXT_IMAGE_NOT_FOUND',
  'AMBIGUOUS_SOURCE_AUDIO',
  'NO_SPEECH',
  'WRONG_LANGUAGE_VI',
  'WRONG_LANGUAGE_OTHER',
  'COMPLETELY_UNRELATED',
]);
const SCORING_DISPOSITIONS = new Set([
  'NORMAL', 'ZERO_CANDIDATE', 'ZERO_SOURCE_DATA', 'ZERO_RESPONSE_QUALITY',
  'INVALID_PROMPT_SOURCE', 'REVIEW_REQUIRED',
]);
const ZERO_ORIGINS = new Set(['CANDIDATE', 'SOURCE_DATA', 'RESPONSE_QUALITY', 'SYSTEM']);
const ERROR_TYPES = Object.freeze({
  RESPOND_TO_QUESTIONS: new Set([
    'TASK_RELEVANCE',
    'TASK_COMPLETENESS',
    'CONTENT_DEVELOPMENT',
    'GRAMMAR',
    'VOCABULARY',
    'PRONUNCIATION',
    'INTONATION_FLUENCY',
    'COHESION',
  ]),
  RESPOND_USING_INFORMATION: new Set([
    'FACTUAL_ACCURACY',
    'REQUESTED_DETAIL',
    'INFORMATION_DELIVERY',
    'GRAMMAR',
    'VOCABULARY',
    'PRONUNCIATION',
    'INTONATION_FLUENCY',
    'COHESION',
  ]),
});
const PROGRESS_SEQUENCE = Object.freeze({
  SCORE_READY: 1,
  ERRORS_READY: 2,
  COMMENT_READY: 3,
  QUESTION_COMPLETED: 4,
});

class ExtendedSpeakingQuestionOutputError extends Error {
  constructor(message, code = 'IIG_AI_EXTENDED_SPEAKING_DIFY_OUTPUT_INVALID') {
    super(message);
    this.name = 'ExtendedSpeakingQuestionOutputError';
    this.code = code;
    this.retryable = true;
  }
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ExtendedSpeakingQuestionOutputError(`${label} must be an object.`);
  }
  return value;
}

function text(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') {
    throw new ExtendedSpeakingQuestionOutputError(`${label} must be a string.`);
  }
  const normalized = value.normalize('NFKC').trim();
  if (!allowEmpty && !normalized) {
    throw new ExtendedSpeakingQuestionOutputError(`${label} must not be empty.`);
  }
  return normalized;
}

function score(value, label, { integer = true } = {}) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < SCORE_MIN || normalized > SCORE_MAX
      || (integer && !Number.isInteger(normalized))) {
    throw new ExtendedSpeakingQuestionOutputError(
      `${label} must be ${integer ? 'an integer' : 'a number'} from 0 to 3.`
    );
  }
  return normalized;
}

function parseJson(value, label) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) {
    throw new ExtendedSpeakingQuestionOutputError(`${label} must contain JSON.`);
  }
  try {
    return object(JSON.parse(value), label);
  } catch (error) {
    if (error instanceof ExtendedSpeakingQuestionOutputError) throw error;
    throw new ExtendedSpeakingQuestionOutputError(`${label} is not valid JSON.`);
  }
}

function parseErrors(value, scorerType) {
  if (!Array.isArray(value) || value.length > 100) {
    throw new ExtendedSpeakingQuestionOutputError('errors must be an array with at most 100 entries.');
  }
  const accepted = ERROR_TYPES[scorerType];
  const grouped = new Map();
  value.forEach((entry, index) => {
    const item = object(entry, `errors[${index}]`);
    const errorType = text(item.error_type, `errors[${index}].error_type`).toUpperCase();
    if (!accepted.has(errorType)) {
      throw new ExtendedSpeakingQuestionOutputError(`errors[${index}].error_type is unsupported.`);
    }
    const severity = text(item.severity, `errors[${index}].severity`).toUpperCase();
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(severity)) {
      throw new ExtendedSpeakingQuestionOutputError(`errors[${index}].severity is unsupported.`);
    }
    const count = Number(item.count);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      throw new ExtendedSpeakingQuestionOutputError(
        `errors[${index}].count must be an integer from 1 to 99.`
      );
    }
    const evidence = Array.isArray(item.evidence)
      ? item.evidence.map((part, evidenceIndex) => text(
        part,
        `errors[${index}].evidence[${evidenceIndex}]`
      ))
      : [text(item.evidence ?? '', `errors[${index}].evidence`, { allowEmpty: true })]
        .filter(Boolean);
    const parsed = {
      errorType,
      severity,
      count,
      evidence,
      messageVi: text(item.message_vi, `errors[${index}].message_vi`),
    };
    const existing = grouped.get(errorType);
    if (!existing) {
      grouped.set(errorType, parsed);
      return;
    }
    const severityRank = { LOW: 1, MEDIUM: 2, HIGH: 3 };
    if (severityRank[parsed.severity] > severityRank[existing.severity]) {
      existing.severity = parsed.severity;
    }
    existing.count = Math.min(99, existing.count + parsed.count);
    existing.evidence = [...new Set([...existing.evidence, ...parsed.evidence])];
    if (parsed.messageVi.length > existing.messageVi.length) existing.messageVi = parsed.messageVi;
  });
  return [...grouped.values()];
}

function parseComment(value) {
  const input = object(value, 'comment');
  const strength = text(input.strength, 'comment.strength');
  const improvement = text(input.improvement, 'comment.improvement');
  const action = text(input.action, 'comment.action');
  return {
    strength,
    improvement,
    action,
    text: text(input.text || [strength, improvement, action].join(' '), 'comment.text'),
  };
}

function expectedIdentity(expected) {
  const profile = profileForScorerType(expected.scorerType);
  const questionNumber = validateQuestion(profile, expected.questionNumber);
  return {
    profile,
    questionNumber,
    questionId: `s_q${questionNumber}`,
    responseProfile: responseProfile(questionNumber),
  };
}

function parseExtendedSpeakingQuestionResult(value, expected = {}) {
  const identity = expectedIdentity(expected);
  const input = parseJson(value, 'result_json');
  if (input.schema_version !== identity.profile.resultSchemaVersion) {
    throw new ExtendedSpeakingQuestionOutputError(
      `Unsupported result schema: ${input.schema_version || '(empty)'}.`
    );
  }
  const jobId = text(input.job_id, 'job_id');
  const keycode = text(input.keycode, 'keycode');
  const questionId = text(input.question_id, 'question_id').toLowerCase();
  if (questionId !== identity.questionId) {
    throw new ExtendedSpeakingQuestionOutputError(`question_id must be ${identity.questionId}.`);
  }
  if (input.group_code !== identity.profile.groupCode) {
    throw new ExtendedSpeakingQuestionOutputError(
      `group_code must be ${identity.profile.groupCode}.`
    );
  }
  if (input.response_profile !== identity.responseProfile) {
    throw new ExtendedSpeakingQuestionOutputError(
      `response_profile must be ${identity.responseProfile}.`
    );
  }
  if (input.status !== 'COMPLETED') {
    throw new ExtendedSpeakingQuestionOutputError(`Result status is ${input.status || '(empty)'}.`);
  }
  if (expected.jobId && jobId !== String(expected.jobId)) {
    throw new ExtendedSpeakingQuestionOutputError('Result job_id does not match.');
  }
  if (expected.keycode && keycode !== String(expected.keycode)) {
    throw new ExtendedSpeakingQuestionOutputError('Result keycode does not match.');
  }

  const scores = {
    pronunciation: score(input.pronunciation_score, 'pronunciation_score'),
    intonationFluency: score(input.intonation_fluency_score, 'intonation_fluency_score'),
    grammar: score(input.grammar_score, 'grammar_score'),
    vocabulary: score(input.vocabulary_score, 'vocabulary_score'),
    cohesion: score(input.cohesion_score, 'cohesion_score'),
    relevance: score(input.relevance_score, 'relevance_score'),
    completeness: score(input.completeness_score, 'completeness_score'),
  };
  const questionScoreRaw = score(input.question_score_raw, 'question_score_raw', { integer: false });
  const questionScoreRounded = score(input.question_score_rounded, 'question_score_rounded');
  const calculatedRaw = Object.values(scores).reduce((sum, part) => sum + part, 0) / 7;
  const calculatedRounded = Math.floor(calculatedRaw + 0.5);
  if (Math.abs(questionScoreRaw - calculatedRaw) > RAW_SCORE_TRANSPORT_TOLERANCE
      || questionScoreRounded !== calculatedRounded) {
    throw new ExtendedSpeakingQuestionOutputError('Scores are internally inconsistent.');
  }

  const zeroReason = input.zero_reason == null
    ? null
    : text(input.zero_reason, 'zero_reason').toUpperCase();
  if (zeroReason && !ZERO_REASONS.has(zeroReason)) {
    throw new ExtendedSpeakingQuestionOutputError('zero_reason is unsupported.');
  }
  if ((questionScoreRounded === 0) !== Boolean(zeroReason)) {
    throw new ExtendedSpeakingQuestionOutputError(
      'zero_reason must be present exactly when the score is zero.'
    );
  }
  const scoringDisposition = text(
    input.scoring_disposition || (zeroReason ? 'ZERO_RESPONSE_QUALITY' : 'NORMAL'),
    'scoring_disposition'
  ).toUpperCase();
  if (!SCORING_DISPOSITIONS.has(scoringDisposition)) {
    throw new ExtendedSpeakingQuestionOutputError('scoring_disposition is unsupported.');
  }
  const zeroOrigin = input.zero_origin == null
    ? null
    : text(input.zero_origin, 'zero_origin').toUpperCase();
  if (zeroOrigin && !ZERO_ORIGINS.has(zeroOrigin)) {
    throw new ExtendedSpeakingQuestionOutputError('zero_origin is unsupported.');
  }
  if ((scoringDisposition === 'NORMAL') !== !zeroReason) {
    throw new ExtendedSpeakingQuestionOutputError('scoring_disposition and zero_reason are inconsistent.');
  }
  const resolutionMetadata = object(input.resolution_metadata || {}, 'resolution_metadata');

  return {
    schemaVersion: identity.profile.resultSchemaVersion,
    jobId,
    keycode,
    questionId,
    questionNumber: identity.questionNumber,
    scorerType: identity.profile.scorerType,
    groupCode: identity.profile.groupCode,
    responseProfile: identity.responseProfile,
    status: 'COMPLETED',
    pronunciationScore: scores.pronunciation,
    intonationFluencyScore: scores.intonationFluency,
    grammarScore: scores.grammar,
    vocabularyScore: scores.vocabulary,
    cohesionScore: scores.cohesion,
    relevanceScore: scores.relevance,
    completenessScore: scores.completeness,
    questionScoreRaw: calculatedRaw,
    questionScoreRounded,
    zeroReason,
    scoringDisposition,
    zeroOrigin,
    resolutionMetadata,
    ruleSignals: object(input.rule_signals || {}, 'rule_signals'),
    appliedRules: Array.isArray(input.applied_rules)
      ? input.applied_rules.map((item, index) => text(item, `applied_rules[${index}]`))
      : [],
    errors: parseErrors(input.errors || [], identity.profile.scorerType),
    comment: parseComment(input.comment),
    versions: object(input.versions || {}, 'versions'),
  };
}

function parseExtendedSpeakingProgressEvent(value, expected = {}) {
  const identity = expectedIdentity(expected);
  const input = parseJson(value, 'progress event');
  if (input.schema_version !== identity.profile.progressSchemaVersion) {
    throw new ExtendedSpeakingQuestionOutputError(
      `Unsupported progress schema: ${input.schema_version || '(empty)'}.`
    );
  }
  const eventType = text(input.event_type, 'event_type').toUpperCase();
  if (!PROGRESS_SEQUENCE[eventType] || Number(input.sequence) !== PROGRESS_SEQUENCE[eventType]) {
    throw new ExtendedSpeakingQuestionOutputError('Progress event type and sequence are inconsistent.');
  }
  const jobId = text(input.job_id, 'job_id');
  const questionId = text(input.question_id, 'question_id').toLowerCase();
  if (questionId !== identity.questionId) {
    throw new ExtendedSpeakingQuestionOutputError('Progress question_id does not match.');
  }
  if (expected.jobId && jobId !== String(expected.jobId)) {
    throw new ExtendedSpeakingQuestionOutputError('Progress job_id does not match.');
  }
  return {
    schemaVersion: identity.profile.progressSchemaVersion,
    eventType,
    jobId,
    questionId,
    sequence: Number(input.sequence),
    data: object(input.data, 'progress data'),
  };
}

module.exports = {
  PROGRESS_SEQUENCE,
  ZERO_REASONS,
  ERROR_TYPES,
  ExtendedSpeakingQuestionOutputError,
  parseExtendedSpeakingQuestionResult,
  parseExtendedSpeakingProgressEvent,
};
