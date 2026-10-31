const PROFILE = Object.freeze({
  scorerType: 'EXPRESS_AN_OPINION',
  groupCode: 'EXPRESS_AN_OPINION',
  questionNumbers: Object.freeze([11]),
  responseProfile: 'EXTENDED_OPINION',
  resultSchemaVersion: 'express-opinion-question-result-v1',
  progressSchemaVersion: 'express-opinion-progress-event-v1',
  inputSchemaVersion: 'express-opinion-question-input-v1',
  envPrefix: 'IIG_AI_EXPRESS_OPINION',
  defaultPromptVersion: 'express-opinion-question-flow-v3',
  aggregationVersionPrefix: 'express-opinion-q11-',
});

function validateQuestion(scorerType, questionNumber) {
  const normalizedType = String(scorerType || '').normalize('NFKC').trim().toUpperCase();
  const normalizedNumber = Number(questionNumber);
  if (normalizedType !== PROFILE.scorerType || normalizedNumber !== 11) {
    throw Object.assign(new Error('Express Opinion scoring only accepts question 11.'), {
      code: 'IIG_AI_EXPRESS_OPINION_QUESTION_MISMATCH',
      retryable: false,
    });
  }
  return normalizedNumber;
}

module.exports = { PROFILE, validateQuestion };
