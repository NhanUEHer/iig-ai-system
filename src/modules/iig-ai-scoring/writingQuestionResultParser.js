const { profileForScorerType, validateWritingQuestion } = require('./writingProfiles');

const ZERO_REASONS = new Set([
  'BLANK_RESPONSE', 'NON_ENGLISH_RESPONSE', 'GIBBERISH_RESPONSE',
  'COPIED_PROMPT', 'NO_ORIGINAL_CONTENT', 'COMPLETELY_OFF_TOPIC',
  'PROMPT_TEXT_NOT_FOUND', 'CONTEXT_NOT_FOUND', 'CONTEXT_IMAGE_NOT_FOUND',
  'AMBIGUOUS_SOURCE_CONTENT',
]);
const SCORING_DISPOSITIONS = new Set([
  'NORMAL', 'ZERO_CANDIDATE', 'ZERO_RESPONSE_QUALITY', 'INVALID_PROMPT_SOURCE', 'REVIEW_REQUIRED',
]);
const ZERO_ORIGINS = new Set(['CANDIDATE', 'RESPONSE_QUALITY', 'SOURCE_DATA', 'SYSTEM']);

function inferResolution(zeroReason) {
  if (!zeroReason) return { scoringDisposition: 'NORMAL', zeroOrigin: null };
  if (zeroReason === 'BLANK_RESPONSE') {
    return { scoringDisposition: 'ZERO_CANDIDATE', zeroOrigin: 'CANDIDATE' };
  }
  if (['PROMPT_TEXT_NOT_FOUND', 'CONTEXT_NOT_FOUND', 'CONTEXT_IMAGE_NOT_FOUND'].includes(zeroReason)) {
    return { scoringDisposition: 'INVALID_PROMPT_SOURCE', zeroOrigin: 'SOURCE_DATA' };
  }
  if (zeroReason === 'AMBIGUOUS_SOURCE_CONTENT') {
    return { scoringDisposition: 'REVIEW_REQUIRED', zeroOrigin: 'SYSTEM' };
  }
  return { scoringDisposition: 'ZERO_RESPONSE_QUALITY', zeroOrigin: 'RESPONSE_QUALITY' };
}

const ERROR_TYPES = Object.freeze({
  WRITE_SENTENCE_PICTURE: new Set([
    'GRAMMAR', 'REQUIRED_WORD_USAGE', 'PICTURE_RELEVANCE',
    'SENTENCE_FORMATION', 'WORD_CHOICE', 'SPELLING',
  ]),
  RESPOND_TO_WRITTEN_REQUEST: new Set([
    'TASK_FULFILLMENT', 'GRAMMAR', 'VOCABULARY', 'ORGANIZATION',
    'TONE_REGISTER', 'EMAIL_CONVENTION', 'SPELLING',
  ]),
  WRITE_OPINION_ESSAY: new Set([
    'TASK_RESPONSE', 'IDEA_SUPPORT', 'GRAMMAR', 'VOCABULARY',
    'ORGANIZATION', 'COHESION', 'SPELLING',
  ]),
});

class WritingQuestionOutputError extends Error {
  constructor(message, code = 'IIG_AI_WRITING_DIFY_OUTPUT_INVALID') {
    super(message);
    this.name = 'WritingQuestionOutputError';
    this.code = code;
    this.retryable = true;
  }
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WritingQuestionOutputError(`${label} must be an object.`);
  }
  return value;
}

function text(value, label, allowEmpty = false) {
  if (typeof value !== 'string') throw new WritingQuestionOutputError(`${label} must be a string.`);
  const normalized = value.normalize('NFKC').trim();
  if (!allowEmpty && !normalized) throw new WritingQuestionOutputError(`${label} must not be empty.`);
  return normalized;
}

function identityText(value, label) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return text(value, label);
}

function parseJson(value, label) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) {
    throw new WritingQuestionOutputError(`${label} must contain JSON.`);
  }
  try { return object(JSON.parse(value), label); } catch (error) {
    if (error instanceof WritingQuestionOutputError) throw error;
    throw new WritingQuestionOutputError(`${label} is not valid JSON.`);
  }
}

function numericScore(value, label, max, integer = true) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max || (integer && !Number.isInteger(parsed))) {
    throw new WritingQuestionOutputError(
      `${label} must be ${integer ? 'an integer' : 'a number'} from 0 to ${max}.`
    );
  }
  return parsed;
}

function parseErrors(value, scorerType) {
  if (!Array.isArray(value) || value.length > 100) {
    throw new WritingQuestionOutputError('errors must be an array with at most 100 entries.');
  }
  const grouped = new Map();
  const allowed = ERROR_TYPES[scorerType];
  for (const [index, raw] of value.entries()) {
    const item = object(raw, `errors[${index}]`);
    const errorType = text(item.error_type, `errors[${index}].error_type`).toUpperCase();
    if (!allowed.has(errorType)) throw new WritingQuestionOutputError(`${errorType} is unsupported.`);
    const severity = text(item.severity, `errors[${index}].severity`).toUpperCase();
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(severity)) {
      throw new WritingQuestionOutputError(`${severity} is an unsupported severity.`);
    }
    const count = Number(item.count);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      throw new WritingQuestionOutputError(`errors[${index}].count must be from 1 to 99.`);
    }
    const evidence = Array.isArray(item.evidence)
      ? item.evidence.map((entry, evidenceIndex) => text(
        entry, `errors[${index}].evidence[${evidenceIndex}]`
      ))
      : [text(item.evidence || '', `errors[${index}].evidence`, true)].filter(Boolean);
    const parsed = {
      errorType, severity, count, evidence,
      messageVi: text(item.message_vi, `errors[${index}].message_vi`),
    };
    const existing = grouped.get(errorType);
    if (!existing) grouped.set(errorType, parsed);
    else {
      const rank = { LOW: 1, MEDIUM: 2, HIGH: 3 };
      if (rank[severity] > rank[existing.severity]) existing.severity = severity;
      existing.count = Math.min(99, existing.count + count);
      existing.evidence = [...new Set([...existing.evidence, ...evidence])];
    }
  }
  return [...grouped.values()];
}

function parseComment(value) {
  const input = object(value, 'comment');
  const strength = text(input.strength, 'comment.strength');
  const improvement = text(input.improvement, 'comment.improvement');
  const action = text(input.action, 'comment.action');
  return {
    strength, improvement, action,
    text: text(input.text || `${strength} ${improvement} ${action}`, 'comment.text'),
  };
}

function parseWritingQuestionResult(value, expected = {}) {
  const profile = profileForScorerType(expected.scorerType);
  const questionNumber = validateWritingQuestion(profile, expected.questionNumber);
  const input = parseJson(value, 'result_json');
  if (input.schema_version !== 'writing-question-result-v1') {
    throw new WritingQuestionOutputError('Unsupported Writing result schema.');
  }
  const jobId = text(input.job_id, 'job_id');
  const expectedKeycode = expected.keycode == null
    ? '' : identityText(expected.keycode, 'expected.keycode').toUpperCase();
  const keycode = input.keycode == null || input.keycode === ''
    ? expectedKeycode : identityText(input.keycode, 'keycode').toUpperCase();
  const questionId = text(input.question_id, 'question_id').toLowerCase();
  if (questionId !== `w_q${questionNumber}`) throw new WritingQuestionOutputError('question_id mismatch.');
  const groupCode = input.group_code == null || input.group_code === ''
    ? profile.groupCode : text(input.group_code, 'group_code').toUpperCase();
  if (groupCode !== profile.groupCode) throw new WritingQuestionOutputError('group_code mismatch.');
  if (input.status !== 'COMPLETED') throw new WritingQuestionOutputError('Writing result is not completed.');
  if (expected.jobId && jobId !== String(expected.jobId)) throw new WritingQuestionOutputError('job_id mismatch.');
  if (!keycode) throw new WritingQuestionOutputError('keycode is required.');
  if (expectedKeycode && keycode !== expectedKeycode) {
    throw new WritingQuestionOutputError('keycode mismatch.');
  }
  const rawComponents = object(input.component_scores, 'component_scores');
  const componentScores = {};
  for (const key of profile.componentKeys) {
    const snake = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    componentScores[key] = numericScore(rawComponents[snake], `component_scores.${snake}`, profile.scoreMax);
  }
  const questionScoreRaw = numericScore(input.question_score_raw, 'question_score_raw', profile.scoreMax, false);
  const questionScoreRounded = numericScore(input.question_score_rounded, 'question_score_rounded', profile.scoreMax);
  const zeroReason = input.zero_reason == null ? null : text(input.zero_reason, 'zero_reason').toUpperCase();
  if (zeroReason && !ZERO_REASONS.has(zeroReason)) throw new WritingQuestionOutputError('zero_reason is unsupported.');
  if ((questionScoreRounded === 0) !== Boolean(zeroReason)) {
    throw new WritingQuestionOutputError('zero_reason must be present exactly when score is zero.');
  }
  const inferredResolution = inferResolution(zeroReason);
  const scoringDisposition = text(
    input.scoring_disposition || inferredResolution.scoringDisposition,
    'scoring_disposition'
  ).toUpperCase();
  if (!SCORING_DISPOSITIONS.has(scoringDisposition)) {
    throw new WritingQuestionOutputError('scoring_disposition is unsupported.');
  }
  const zeroOrigin = input.zero_origin == null
    ? inferredResolution.zeroOrigin : text(input.zero_origin, 'zero_origin').toUpperCase();
  if (zeroOrigin && !ZERO_ORIGINS.has(zeroOrigin)) {
    throw new WritingQuestionOutputError('zero_origin is unsupported.');
  }
  if ((scoringDisposition === 'NORMAL') !== !zeroReason
      || (scoringDisposition === 'NORMAL' && zeroOrigin)
      || (scoringDisposition !== 'NORMAL' && !zeroOrigin)) {
    throw new WritingQuestionOutputError('Writing resolution lineage is inconsistent.');
  }
  return {
    schemaVersion: input.schema_version,
    jobId, keycode, questionId, questionNumber,
    scorerType: profile.scorerType,
    groupCode,
    status: 'COMPLETED', componentScores,
    questionScoreRaw, questionScoreRounded, zeroReason, scoringDisposition, zeroOrigin,
    resolutionMetadata: object(input.resolution_metadata || {}, 'resolution_metadata'),
    ruleSignals: object(input.rule_signals || {}, 'rule_signals'),
    appliedRules: Array.isArray(input.applied_rules)
      ? input.applied_rules.map((entry, index) => text(entry, `applied_rules[${index}]`)) : [],
    errors: parseErrors(input.errors || [], profile.scorerType),
    comment: parseComment(input.comment),
    versions: object(input.versions || {}, 'versions'),
  };
}

module.exports = {
  ZERO_REASONS, ERROR_TYPES, WritingQuestionOutputError, identityText, parseWritingQuestionResult,
};
