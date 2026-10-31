const { PROFILE, validateQuestion } = require('./expressOpinionProfile');

const ZERO_REASONS = new Set([
  'ANSWER_NOT_PROVIDED', 'AUDIO_TOO_SHORT', 'AUDIO_NO_SIGNAL', 'AUDIO_CORRUPTED',
  'SOURCE_AUDIO_NOT_FOUND', 'SOURCE_AUDIO_ACCESS_DENIED', 'SOURCE_AUDIO_FETCH_EXHAUSTED',
  'PROMPT_TEXT_NOT_FOUND', 'CONTEXT_NOT_FOUND', 'CONTEXT_IMAGE_NOT_FOUND',
  'AMBIGUOUS_SOURCE_AUDIO', 'NO_SPEECH', 'WRONG_LANGUAGE_VI',
  'WRONG_LANGUAGE_OTHER', 'COMPLETELY_UNRELATED',
]);
const SCORING_DISPOSITIONS = new Set([
  'NORMAL', 'ZERO_CANDIDATE', 'ZERO_RESPONSE_QUALITY', 'ZERO_SOURCE_DATA',
  'INVALID_PROMPT_SOURCE', 'REVIEW_REQUIRED',
]);
const ZERO_ORIGINS = new Set(['CANDIDATE', 'RESPONSE_QUALITY', 'SOURCE_DATA', 'SYSTEM']);
const ERROR_TYPES = new Set([
  'STANCE_TASK_FULFILLMENT', 'SUPPORT_DEVELOPMENT', 'TASK_RELEVANCE', 'COHESION',
  'GRAMMAR', 'VOCABULARY', 'PRONUNCIATION', 'INTONATION_FLUENCY',
]);
const PROGRESS_SEQUENCE = Object.freeze({
  SCORE_READY: 1, ERRORS_READY: 2, COMMENT_READY: 3, QUESTION_COMPLETED: 4,
});

class ExpressOpinionOutputError extends Error {
  constructor(message, code = 'IIG_AI_EXPRESS_OPINION_DIFY_OUTPUT_INVALID') {
    super(message);
    this.name = 'ExpressOpinionOutputError';
    this.code = code;
    this.retryable = true;
  }
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ExpressOpinionOutputError(`${label} must be an object.`);
  }
  return value;
}

function text(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') throw new ExpressOpinionOutputError(`${label} must be a string.`);
  const normalized = value.normalize('NFKC').trim();
  if (!allowEmpty && !normalized) throw new ExpressOpinionOutputError(`${label} must not be empty.`);
  return normalized;
}

function integer(value, label, minimum, maximum) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < minimum || normalized > maximum) {
    throw new ExpressOpinionOutputError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return normalized;
}

function ratio(value, label) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1) {
    throw new ExpressOpinionOutputError(`${label} must be a number from 0 to 1.`);
  }
  return normalized;
}

function parseJson(value, label) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) {
    throw new ExpressOpinionOutputError(`${label} must contain JSON.`);
  }
  try { return object(JSON.parse(value), label); } catch (error) {
    if (error instanceof ExpressOpinionOutputError) throw error;
    throw new ExpressOpinionOutputError(`${label} is not valid JSON.`);
  }
}

function boolean(value, label) {
  if (typeof value !== 'boolean') throw new ExpressOpinionOutputError(`${label} must be boolean.`);
  return value;
}

function parseRuleSignals(value) {
  const input = object(value, 'rule_signals');
  const stanceStatus = text(input.stance_status, 'rule_signals.stance_status').toUpperCase();
  const supportDevelopment = text(
    input.support_development,
    'rule_signals.support_development'
  ).toUpperCase();
  if (!['CLEAR', 'AMBIGUOUS', 'MISSING'].includes(stanceStatus)) {
    throw new ExpressOpinionOutputError('rule_signals.stance_status is unsupported.');
  }
  if (!['STRONG', 'ADEQUATE', 'LIMITED', 'MISSING'].includes(supportDevelopment)) {
    throw new ExpressOpinionOutputError('rule_signals.support_development is unsupported.');
  }
  return {
    stanceStatus,
    promptAlignmentRatio: ratio(input.prompt_alignment_ratio, 'rule_signals.prompt_alignment_ratio'),
    reasonCount: integer(input.reason_count, 'rule_signals.reason_count', 0, 99),
    developedReasonCount: integer(
      input.developed_reason_count,
      'rule_signals.developed_reason_count',
      0,
      99
    ),
    exampleCount: integer(input.example_count, 'rule_signals.example_count', 0, 99),
    supportDevelopment,
    copiedPromptOnly: boolean(input.copied_prompt_only, 'rule_signals.copied_prompt_only'),
    completelyUnrelated: boolean(input.completely_unrelated, 'rule_signals.completely_unrelated'),
    cutOff: boolean(input.cut_off, 'rule_signals.cut_off'),
    excessiveFillers: boolean(input.excessive_fillers, 'rule_signals.excessive_fillers'),
  };
}

function parseErrors(value) {
  if (!Array.isArray(value) || value.length > 100) {
    throw new ExpressOpinionOutputError('errors must be an array with at most 100 entries.');
  }
  const grouped = new Map();
  const rank = { LOW: 1, MEDIUM: 2, HIGH: 3 };
  value.forEach((entry, index) => {
    const item = object(entry, `errors[${index}]`);
    const errorType = text(item.error_type, `errors[${index}].error_type`).toUpperCase();
    const severity = text(item.severity, `errors[${index}].severity`).toUpperCase();
    if (!ERROR_TYPES.has(errorType)) {
      throw new ExpressOpinionOutputError(`errors[${index}].error_type is unsupported.`);
    }
    if (!rank[severity]) throw new ExpressOpinionOutputError(`errors[${index}].severity is unsupported.`);
    const evidence = Array.isArray(item.evidence)
      ? item.evidence.map((part, evidenceIndex) => text(part, `errors[${index}].evidence[${evidenceIndex}]`))
      : [text(item.evidence ?? '', `errors[${index}].evidence`, { allowEmpty: true })].filter(Boolean);
    const parsed = {
      errorType,
      severity,
      count: integer(item.count, `errors[${index}].count`, 1, 99),
      evidence,
      messageVi: text(item.message_vi, `errors[${index}].message_vi`),
    };
    const existing = grouped.get(errorType);
    if (!existing) return void grouped.set(errorType, parsed);
    if (rank[parsed.severity] > rank[existing.severity]) existing.severity = parsed.severity;
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
    text: text(input.text || `${strength} ${improvement} ${action}`, 'comment.text'),
  };
}

function expectedIdentity(expected) {
  validateQuestion(expected.scorerType || PROFILE.scorerType, expected.questionNumber ?? 11);
  return { questionId: 's_q11' };
}

function parseExpressOpinionQuestionResult(value, expected = {}) {
  const identity = expectedIdentity(expected);
  const input = parseJson(value, 'result_json');
  if (input.schema_version !== PROFILE.resultSchemaVersion) {
    throw new ExpressOpinionOutputError(`Unsupported result schema: ${input.schema_version || '(empty)'}.`);
  }
  const jobId = text(input.job_id, 'job_id');
  const keycode = text(input.keycode, 'keycode');
  const questionId = text(input.question_id, 'question_id').toLowerCase();
  if (questionId !== identity.questionId) throw new ExpressOpinionOutputError('question_id must be s_q11.');
  if (input.group_code !== PROFILE.groupCode) {
    throw new ExpressOpinionOutputError(`group_code must be ${PROFILE.groupCode}.`);
  }
  if (input.response_profile !== PROFILE.responseProfile) {
    throw new ExpressOpinionOutputError(`response_profile must be ${PROFILE.responseProfile}.`);
  }
  if (input.status !== 'COMPLETED') throw new ExpressOpinionOutputError('status must be COMPLETED.');
  if (expected.jobId && jobId !== String(expected.jobId)) throw new ExpressOpinionOutputError('Result job_id does not match.');
  if (expected.keycode && keycode !== String(expected.keycode)) throw new ExpressOpinionOutputError('Result keycode does not match.');

  const scores = {
    pronunciationScore: integer(input.pronunciation_score, 'pronunciation_score', 0, 5),
    intonationFluencyScore: integer(input.intonation_fluency_score, 'intonation_fluency_score', 0, 5),
    grammarScore: integer(input.grammar_score, 'grammar_score', 0, 5),
    vocabularyScore: integer(input.vocabulary_score, 'vocabulary_score', 0, 5),
    cohesionScore: integer(input.cohesion_score, 'cohesion_score', 0, 5),
    relevanceScore: integer(input.relevance_score, 'relevance_score', 0, 5),
    completenessScore: integer(input.completeness_score, 'completeness_score', 0, 5),
  };
  const holisticScorePreliminary = integer(
    input.holistic_score_preliminary,
    'holistic_score_preliminary',
    0,
    5
  );
  const questionScoreFinal = integer(input.question_score_final, 'question_score_final', 0, 5);
  const zeroReason = input.zero_reason == null
    ? null : text(input.zero_reason, 'zero_reason').toUpperCase();
  if (zeroReason && !ZERO_REASONS.has(zeroReason)) {
    throw new ExpressOpinionOutputError('zero_reason is unsupported.');
  }
  if ((questionScoreFinal === 0) !== Boolean(zeroReason)) {
    throw new ExpressOpinionOutputError('zero_reason must be present exactly when final score is zero.');
  }
  if (zeroReason && (holisticScorePreliminary !== 0 || Object.values(scores).some(value => value !== 0))) {
    throw new ExpressOpinionOutputError('All component and holistic scores must be zero for a zero-score response.');
  }
  const scoringDisposition = text(
    input.scoring_disposition || (zeroReason ? 'ZERO_RESPONSE_QUALITY' : 'NORMAL'),
    'scoring_disposition'
  ).toUpperCase();
  if (!SCORING_DISPOSITIONS.has(scoringDisposition)) {
    throw new ExpressOpinionOutputError('scoring_disposition is unsupported.');
  }
  const zeroOrigin = input.zero_origin == null
    ? null : text(input.zero_origin, 'zero_origin').toUpperCase();
  if (zeroOrigin && !ZERO_ORIGINS.has(zeroOrigin)) {
    throw new ExpressOpinionOutputError('zero_origin is unsupported.');
  }
  if ((scoringDisposition === 'NORMAL') !== !zeroReason) {
    throw new ExpressOpinionOutputError('scoring_disposition and zero_reason are inconsistent.');
  }
  const resolutionMetadata = object(input.resolution_metadata || {}, 'resolution_metadata');

  return {
    schemaVersion: PROFILE.resultSchemaVersion,
    jobId,
    keycode,
    questionId,
    questionNumber: 11,
    scorerType: PROFILE.scorerType,
    groupCode: PROFILE.groupCode,
    responseProfile: PROFILE.responseProfile,
    status: 'COMPLETED',
    ...scores,
    holisticScorePreliminary,
    questionScoreFinal,
    zeroReason,
    scoringDisposition,
    zeroOrigin,
    resolutionMetadata,
    ruleSignals: parseRuleSignals(input.rule_signals),
    appliedRules: Array.isArray(input.applied_rules)
      ? input.applied_rules.map((item, index) => text(item, `applied_rules[${index}]`)) : [],
    errors: parseErrors(input.errors || []),
    comment: parseComment(input.comment),
    versions: object(input.versions || {}, 'versions'),
  };
}

function parseExpressOpinionProgressEvent(value, expected = {}) {
  expectedIdentity(expected);
  const input = parseJson(value, 'progress event');
  if (input.schema_version !== PROFILE.progressSchemaVersion) {
    throw new ExpressOpinionOutputError(`Unsupported progress schema: ${input.schema_version || '(empty)'}.`);
  }
  const eventType = text(input.event_type, 'event_type').toUpperCase();
  if (!PROGRESS_SEQUENCE[eventType] || Number(input.sequence) !== PROGRESS_SEQUENCE[eventType]) {
    throw new ExpressOpinionOutputError('Progress event type and sequence are inconsistent.');
  }
  const jobId = text(input.job_id, 'job_id');
  const questionId = text(input.question_id, 'question_id').toLowerCase();
  if (questionId !== 's_q11') throw new ExpressOpinionOutputError('Progress question_id must be s_q11.');
  if (expected.jobId && jobId !== String(expected.jobId)) throw new ExpressOpinionOutputError('Progress job_id does not match.');
  return {
    schemaVersion: PROFILE.progressSchemaVersion,
    eventType,
    jobId,
    questionId,
    sequence: Number(input.sequence),
    data: object(input.data, 'progress data'),
  };
}

module.exports = {
  ZERO_REASONS,
  ERROR_TYPES,
  PROGRESS_SEQUENCE,
  ExpressOpinionOutputError,
  parseExpressOpinionQuestionResult,
  parseExpressOpinionProgressEvent,
};
