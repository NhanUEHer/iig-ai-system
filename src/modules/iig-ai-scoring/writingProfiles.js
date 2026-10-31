const PROFILES = Object.freeze({
  WRITE_SENTENCE_PICTURE: Object.freeze({
    scorerType: 'WRITE_SENTENCE_PICTURE',
    groupCode: 'WRITE_SENTENCE_PICTURE',
    minQuestion: 1,
    maxQuestion: 5,
    scoreMax: 3,
    envPrefix: 'IIG_AI_WRITE_SENTENCE_PICTURE',
    defaultPromptVersion: 'write-sentence-picture-v2',
    componentKeys: Object.freeze([
      'grammar', 'pictureRelevance', 'requiredWordUsage', 'sentenceQuality',
    ]),
  }),
  RESPOND_TO_WRITTEN_REQUEST: Object.freeze({
    scorerType: 'RESPOND_TO_WRITTEN_REQUEST',
    groupCode: 'RESPOND_TO_WRITTEN_REQUEST',
    minQuestion: 6,
    maxQuestion: 7,
    scoreMax: 4,
    envPrefix: 'IIG_AI_WRITTEN_REQUEST',
    defaultPromptVersion: 'respond-written-request-score-v2',
    componentKeys: Object.freeze([
      'taskFulfillment', 'sentenceQuality', 'vocabulary', 'organization',
    ]),
  }),
  WRITE_OPINION_ESSAY: Object.freeze({
    scorerType: 'WRITE_OPINION_ESSAY',
    groupCode: 'WRITE_OPINION_ESSAY',
    minQuestion: 8,
    maxQuestion: 8,
    scoreMax: 5,
    envPrefix: 'IIG_AI_OPINION_ESSAY',
    defaultPromptVersion: 'write-opinion-essay-score-v2',
    componentKeys: Object.freeze([
      'opinionSupport', 'grammar', 'vocabulary', 'organization',
    ]),
  }),
});

function profileForScorerType(value) {
  const scorerType = String(value || '').normalize('NFKC').trim().toUpperCase();
  const profile = PROFILES[scorerType];
  if (!profile) {
    throw Object.assign(new Error(`Unsupported Writing scorer type: ${scorerType || '(empty)'}.`), {
      code: 'IIG_AI_WRITING_PROFILE_UNSUPPORTED',
      retryable: false,
    });
  }
  return profile;
}

function validateWritingQuestion(profileOrType, value) {
  const profile = typeof profileOrType === 'string'
    ? profileForScorerType(profileOrType)
    : profileOrType;
  const number = Number(value);
  if (!Number.isInteger(number) || number < profile.minQuestion || number > profile.maxQuestion) {
    throw Object.assign(new Error(
      `Question ${value} is not valid for ${profile.scorerType}.`
    ), { code: 'IIG_AI_WRITING_QUESTION_INVALID', retryable: false });
  }
  return number;
}

module.exports = { PROFILES, profileForScorerType, validateWritingQuestion };
