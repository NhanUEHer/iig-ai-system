const SCORE_MIN = 0;
const SCORE_MAX = 3;
const RESULT_SCHEMA_VERSION = 'describe-picture-question-result-v1';
const PROGRESS_SCHEMA_VERSION = 'describe-picture-progress-event-v1';
const QUESTION_IDS = new Set(['s_q3', 's_q4']);
const ZERO_REASONS = new Set([
  'ANSWER_NOT_PROVIDED',
  'AUDIO_TOO_SHORT',
  'AUDIO_NO_SIGNAL',
  'AUDIO_CORRUPTED',
  'SOURCE_AUDIO_NOT_FOUND',
  'SOURCE_AUDIO_ACCESS_DENIED',
  'SOURCE_AUDIO_FETCH_EXHAUSTED',
  'NO_SPEECH',
  'WRONG_LANGUAGE_VI',
  'WRONG_LANGUAGE_OTHER',
  'WRONG_PICTURE',
]);
const ERROR_TYPES = new Set([
  'PRONUNCIATION',
  'INTONATION_FLUENCY',
  'GRAMMAR',
  'VOCABULARY',
  'COHESION',
  'PICTURE_CONTENT',
]);
const PROGRESS_SEQUENCE = Object.freeze({
  SCORE_READY: 1,
  ERRORS_READY: 2,
  COMMENT_READY: 3,
  QUESTION_COMPLETED: 4,
});

class DescribePictureQuestionOutputError extends Error {
  constructor(message, code = 'IIG_AI_DESCRIBE_PICTURE_DIFY_OUTPUT_INVALID') {
    super(message);
    this.name = 'DescribePictureQuestionOutputError';
    this.code = code;
    this.retryable = true;
  }
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DescribePictureQuestionOutputError(`${label} must be an object.`);
  }
  return value;
}

function text(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') {
    throw new DescribePictureQuestionOutputError(`${label} must be a string.`);
  }
  const normalized = value.trim();
  if (!allowEmpty && !normalized) {
    throw new DescribePictureQuestionOutputError(`${label} must not be empty.`);
  }
  return normalized;
}

function score(value, label, { integer = true } = {}) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < SCORE_MIN || normalized > SCORE_MAX
      || (integer && !Number.isInteger(normalized))) {
    throw new DescribePictureQuestionOutputError(
      `${label} must be ${integer ? 'an integer' : 'a number'} from 0 to 3.`
    );
  }
  return normalized;
}

function parseJson(value, label) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) {
    throw new DescribePictureQuestionOutputError(`${label} must contain JSON.`);
  }
  try {
    return object(JSON.parse(value), label);
  } catch (error) {
    if (error instanceof DescribePictureQuestionOutputError) throw error;
    throw new DescribePictureQuestionOutputError(`${label} is not valid JSON.`);
  }
}

function parseErrors(value) {
  if (!Array.isArray(value) || value.length > 100) {
    throw new DescribePictureQuestionOutputError('errors must be an array with at most 100 entries.');
  }
  const unique = new Map();
  value.forEach((entry, index) => {
    const item = object(entry, `errors[${index}]`);
    const errorType = text(item.error_type, `errors[${index}].error_type`).toUpperCase();
    if (!ERROR_TYPES.has(errorType)) {
      throw new DescribePictureQuestionOutputError(`errors[${index}].error_type is unsupported.`);
    }
    const severity = text(item.severity, `errors[${index}].severity`).toUpperCase();
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(severity)) {
      throw new DescribePictureQuestionOutputError(`errors[${index}].severity is unsupported.`);
    }
    const count = Number(item.count);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      throw new DescribePictureQuestionOutputError(
        `errors[${index}].count must be an integer from 1 to 99.`
      );
    }
    const parsed = {
      errorType,
      severity,
      count,
      evidence: text(item.evidence ?? '', `errors[${index}].evidence`, { allowEmpty: true }),
      messageVi: text(item.message_vi, `errors[${index}].message_vi`),
    };
    const duplicateKey = [parsed.errorType, parsed.evidence, parsed.messageVi]
      .map(part => part.toLocaleLowerCase('vi').replace(/\s+/g, ' ').trim())
      .join('\u0000');
    const existing = unique.get(duplicateKey);
    if (!existing) {
      unique.set(duplicateKey, parsed);
      return;
    }
    const severityRank = { LOW: 1, MEDIUM: 2, HIGH: 3 };
    if (severityRank[parsed.severity] > severityRank[existing.severity]) {
      existing.severity = parsed.severity;
    }
    existing.count = Math.max(existing.count, parsed.count);
  });
  return [...unique.values()];
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

function parseDescribePictureQuestionResult(value, expected = {}) {
  const input = parseJson(value, 'result_json');
  if (input.schema_version !== RESULT_SCHEMA_VERSION) {
    throw new DescribePictureQuestionOutputError(
      `Unsupported Describe Picture result schema: ${input.schema_version}.`
    );
  }
  const jobId = text(input.job_id, 'job_id');
  const keycode = text(input.keycode, 'keycode');
  const questionId = text(input.question_id, 'question_id').toLowerCase();
  if (!QUESTION_IDS.has(questionId)) {
    throw new DescribePictureQuestionOutputError('question_id must be s_q3 or s_q4.');
  }
  if (input.group_code !== 'DESCRIBE_PICTURE') {
    throw new DescribePictureQuestionOutputError('group_code must be DESCRIBE_PICTURE.');
  }
  if (input.status !== 'COMPLETED') {
    throw new DescribePictureQuestionOutputError(
      `Describe Picture result status is ${input.status || '(empty)'}.`
    );
  }
  if (expected.jobId && jobId !== String(expected.jobId)) {
    throw new DescribePictureQuestionOutputError('Describe Picture result job_id does not match.');
  }
  if (expected.keycode && keycode !== String(expected.keycode)) {
    throw new DescribePictureQuestionOutputError('Describe Picture result keycode does not match.');
  }
  if (expected.questionId && questionId !== String(expected.questionId).toLowerCase()) {
    throw new DescribePictureQuestionOutputError('Describe Picture result question_id does not match.');
  }

  const scores = {
    pronunciation: score(input.pronunciation_score, 'pronunciation_score'),
    intonationFluency: score(input.intonation_fluency_score, 'intonation_fluency_score'),
    grammar: score(input.grammar_score, 'grammar_score'),
    vocabulary: score(input.vocabulary_score, 'vocabulary_score'),
    cohesion: score(input.cohesion_score, 'cohesion_score'),
  };
  const questionScoreRaw = score(input.question_score_raw, 'question_score_raw', { integer: false });
  const questionScoreRounded = score(input.question_score_rounded, 'question_score_rounded');
  const expectedRaw = Object.values(scores).reduce((sum, value) => sum + value, 0) / 5;
  const expectedRounded = Math.floor(expectedRaw + 0.5);
  if (Math.abs(questionScoreRaw - expectedRaw) > 0.000001 || questionScoreRounded !== expectedRounded) {
    throw new DescribePictureQuestionOutputError('Describe Picture scores are internally inconsistent.');
  }

  const zeroReason = input.zero_reason == null
    ? null
    : text(input.zero_reason, 'zero_reason').toUpperCase();
  if (zeroReason && !ZERO_REASONS.has(zeroReason)) {
    throw new DescribePictureQuestionOutputError('zero_reason is unsupported.');
  }
  if ((questionScoreRounded === 0) !== Boolean(zeroReason)) {
    throw new DescribePictureQuestionOutputError(
      'zero_reason must be present exactly when the score is zero.'
    );
  }
  const scoringDisposition = text(
    input.scoring_disposition || (zeroReason ? 'ZERO_RESPONSE_QUALITY' : 'NORMAL'),
    'scoring_disposition'
  ).toUpperCase();
  const zeroOrigin = input.zero_origin == null
    ? null
    : text(input.zero_origin, 'zero_origin').toUpperCase();
  const resolutionMetadata = object(input.resolution_metadata || {}, 'resolution_metadata');

  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    jobId,
    keycode,
    questionId,
    groupCode: 'DESCRIBE_PICTURE',
    status: 'COMPLETED',
    pronunciationScore: scores.pronunciation,
    intonationFluencyScore: scores.intonationFluency,
    grammarScore: scores.grammar,
    vocabularyScore: scores.vocabulary,
    cohesionScore: scores.cohesion,
    questionScoreRaw,
    questionScoreRounded,
    zeroReason,
    scoringDisposition,
    zeroOrigin,
    resolutionMetadata,
    ruleSignals: object(input.rule_signals || {}, 'rule_signals'),
    appliedRules: Array.isArray(input.applied_rules)
      ? input.applied_rules.map((item, index) => text(item, `applied_rules[${index}]`))
      : [],
    errors: parseErrors(input.errors || []),
    comment: parseComment(input.comment),
    versions: object(input.versions || {}, 'versions'),
  };
}

function parseDescribePictureProgressEvent(value, expected = {}) {
  const input = parseJson(value, 'progress event');
  if (input.schema_version !== PROGRESS_SCHEMA_VERSION) {
    throw new DescribePictureQuestionOutputError(
      `Unsupported Describe Picture progress schema: ${input.schema_version}.`
    );
  }
  const eventType = text(input.event_type, 'event_type').toUpperCase();
  if (!PROGRESS_SEQUENCE[eventType] || Number(input.sequence) !== PROGRESS_SEQUENCE[eventType]) {
    throw new DescribePictureQuestionOutputError(
      'Describe Picture progress event type and sequence are inconsistent.'
    );
  }
  const jobId = text(input.job_id, 'job_id');
  const questionId = text(input.question_id, 'question_id').toLowerCase();
  if (!QUESTION_IDS.has(questionId)) {
    throw new DescribePictureQuestionOutputError('progress question_id must be s_q3 or s_q4.');
  }
  if (expected.jobId && jobId !== String(expected.jobId)) {
    throw new DescribePictureQuestionOutputError('Describe Picture progress job_id does not match.');
  }
  if (expected.questionId && questionId !== String(expected.questionId).toLowerCase()) {
    throw new DescribePictureQuestionOutputError('Describe Picture progress question_id does not match.');
  }
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    eventType,
    jobId,
    questionId,
    sequence: Number(input.sequence),
    data: object(input.data, 'progress data'),
  };
}

module.exports = {
  RESULT_SCHEMA_VERSION,
  PROGRESS_SCHEMA_VERSION,
  PROGRESS_SEQUENCE,
  ERROR_TYPES,
  DescribePictureQuestionOutputError,
  parseDescribePictureQuestionResult,
  parseDescribePictureProgressEvent,
};
