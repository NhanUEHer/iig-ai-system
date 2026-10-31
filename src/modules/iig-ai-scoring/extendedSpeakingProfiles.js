const PROFILES = Object.freeze({
  RESPOND_TO_QUESTIONS: Object.freeze({
    scorerType: 'RESPOND_TO_QUESTIONS',
    groupCode: 'RESPOND_TO_QUESTIONS',
    questionNumbers: Object.freeze([5, 6, 7]),
    resultSchemaVersion: 'respond-questions-question-result-v1',
    progressSchemaVersion: 'respond-questions-progress-event-v1',
    inputSchemaVersion: 'respond-questions-question-input-v1',
    envPrefix: 'IIG_AI_RESPOND_QUESTIONS',
    defaultPromptVersion: 'respond-questions-question-flow-v2',
    aggregationVersionPrefix: 'respond-q5-q10-',
  }),
  RESPOND_USING_INFORMATION: Object.freeze({
    scorerType: 'RESPOND_USING_INFORMATION',
    groupCode: 'RESPOND_USING_INFORMATION',
    questionNumbers: Object.freeze([8, 9, 10]),
    resultSchemaVersion: 'respond-information-question-result-v1',
    progressSchemaVersion: 'respond-information-progress-event-v1',
    inputSchemaVersion: 'respond-information-question-input-v1',
    envPrefix: 'IIG_AI_RESPOND_INFORMATION',
    defaultPromptVersion: 'respond-information-question-flow-v2',
    aggregationVersionPrefix: 'respond-q5-q10-',
  }),
});

function normalizeScorerType(value) {
  return String(value || '').normalize('NFKC').trim().toUpperCase();
}

function profileForScorerType(value) {
  const profile = PROFILES[normalizeScorerType(value)];
  if (!profile) {
    throw Object.assign(new Error(`Unsupported extended speaking scorer type: ${value || '(empty)'}.`), {
      code: 'IIG_AI_EXTENDED_SPEAKING_PROFILE_UNSUPPORTED',
      retryable: false,
    });
  }
  return profile;
}

function responseProfile(questionNumber) {
  const number = Number(questionNumber);
  if ([5, 6].includes(number)) return 'SHORT_DIRECT_RESPONSE';
  if (number === 7) return 'EXTENDED_RESPONSE';
  if ([8, 9].includes(number)) return 'SHORT_INFORMATION';
  if (number === 10) return 'MULTI_ITEM_INFORMATION';
  throw Object.assign(new Error(`Unsupported extended speaking question number: ${questionNumber}.`), {
    code: 'IIG_AI_EXTENDED_SPEAKING_QUESTION_UNSUPPORTED',
    retryable: false,
  });
}

function validateQuestion(profile, questionNumber) {
  const number = Number(questionNumber);
  if (!profile.questionNumbers.includes(number)) {
    throw Object.assign(new Error(
      `Question ${questionNumber} is not valid for ${profile.scorerType}.`
    ), {
      code: 'IIG_AI_EXTENDED_SPEAKING_QUESTION_MISMATCH',
      retryable: false,
    });
  }
  return number;
}

module.exports = {
  PROFILES,
  normalizeScorerType,
  profileForScorerType,
  responseProfile,
  validateQuestion,
};
