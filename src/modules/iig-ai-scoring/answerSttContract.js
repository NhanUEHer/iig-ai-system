const ANSWER_STT_INPUT_SCHEMA_VERSION = 1;
const ANSWER_STT_OUTPUT_SCHEMA_VERSION = 1;

const STT_PROFILES = Object.freeze({
  READ_ALOUD_GUIDED: 'READ_ALOUD_GUIDED',
  FREE_SPEECH: 'FREE_SPEECH',
  PROMPT_AUDIO: 'PROMPT_AUDIO',
});

const STT_OUTPUT_STATUSES = Object.freeze([
  'SUCCESS',
  'NO_SPEECH',
  'WRONG_LANGUAGE_VI',
  'WRONG_LANGUAGE_OTHER',
  'UNINTELLIGIBLE',
  'FAILED',
]);

const ANSWER_PROFILE_BY_SCORER_TYPE = Object.freeze({
  READ_TEXT_ALOUD: STT_PROFILES.READ_ALOUD_GUIDED,
  DESCRIBE_PICTURE: STT_PROFILES.FREE_SPEECH,
  RESPOND_TO_QUESTIONS: STT_PROFILES.FREE_SPEECH,
  RESPOND_USING_INFORMATION: STT_PROFILES.FREE_SPEECH,
  EXPRESS_AN_OPINION: STT_PROFILES.FREE_SPEECH,
});

function cleanText(value) {
  return String(value || '').trim();
}

function contractError(message, code) {
  return Object.assign(new Error(message), { code, retryable: false });
}

function resolveAnswerSttProfile(scorerType) {
  const normalized = cleanText(scorerType).toUpperCase();
  const profile = ANSWER_PROFILE_BY_SCORER_TYPE[normalized];
  if (!profile) {
    throw contractError(
      `Scorer type ${normalized || '(empty)'} does not support answer STT.`,
      'IIG_AI_ANSWER_STT_SCORER_UNSUPPORTED'
    );
  }
  return profile;
}

function lexicalContext(question, profile) {
  if (profile === STT_PROFILES.READ_ALOUD_GUIDED) {
    const referenceText = cleanText(question.contextText);
    if (!referenceText) {
      throw contractError(
        'Read Text Aloud requires the official passage as reference text.',
        'IIG_AI_ANSWER_STT_REFERENCE_MISSING'
      );
    }
    return {
      referenceText,
      questionText: '',
      contextText: '',
    };
  }

  const scorerType = cleanText(question.scorerType).toUpperCase();
  if (scorerType === 'DESCRIBE_PICTURE') {
    return {
      referenceText: '',
      questionText: cleanText(question.questionText || question.promptText),
      contextText: '',
    };
  }
  return {
    referenceText: '',
    questionText: cleanText(question.questionText || question.promptText),
    contextText: cleanText(question.contextText),
  };
}

function buildAnswerSttInput({ aiInput, questionCode, audioUrl }) {
  if (!aiInput || typeof aiInput !== 'object' || Array.isArray(aiInput)) {
    throw contractError('AI input must be an object.', 'IIG_AI_ANSWER_STT_INPUT_INVALID');
  }
  const question = aiInput.question;
  if (!question || typeof question !== 'object' || Array.isArray(question)) {
    throw contractError('AI input has no question object.', 'IIG_AI_ANSWER_STT_QUESTION_MISSING');
  }
  if (aiInput.response?.type !== 'audio') {
    throw contractError(
      'Answer STT requires an audio response.',
      'IIG_AI_ANSWER_STT_AUDIO_RESPONSE_REQUIRED'
    );
  }
  const normalizedQuestionCode = cleanText(questionCode).toUpperCase();
  if (!/^S_Q\d{1,2}$/.test(normalizedQuestionCode)) {
    throw contractError(
      'questionCode must use the S_Q<number> format.',
      'IIG_AI_ANSWER_STT_QUESTION_CODE_INVALID'
    );
  }
  const normalizedAudioUrl = cleanText(audioUrl);
  let parsedAudioUrl;
  try {
    parsedAudioUrl = new URL(normalizedAudioUrl);
  } catch (_) {
    throw contractError('audioUrl must be a valid HTTPS URL.', 'IIG_AI_ANSWER_STT_AUDIO_URL_INVALID');
  }
  if (parsedAudioUrl.protocol !== 'https:') {
    throw contractError('audioUrl must use HTTPS.', 'IIG_AI_ANSWER_STT_AUDIO_URL_INVALID');
  }

  const profile = resolveAnswerSttProfile(question.scorerType);
  const context = lexicalContext(question, profile);
  return {
    schema_version: ANSWER_STT_INPUT_SCHEMA_VERSION,
    stt_profile: profile,
    question_code: normalizedQuestionCode,
    reference_text: context.referenceText,
    question_text: context.questionText,
    context_text: context.contextText,
    audio_url: parsedAudioUrl.toString(),
  };
}

module.exports = {
  ANSWER_STT_INPUT_SCHEMA_VERSION,
  ANSWER_STT_OUTPUT_SCHEMA_VERSION,
  STT_PROFILES,
  STT_OUTPUT_STATUSES,
  ANSWER_PROFILE_BY_SCORER_TYPE,
  cleanText,
  resolveAnswerSttProfile,
  buildAnswerSttInput,
};
