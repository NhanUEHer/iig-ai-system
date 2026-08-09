const QUESTION_TYPES = Object.freeze({
  SPEAKING_READ_ALOUD: 'sp_read_aloud',
  SPEAKING_DESCRIBE_PICTURE: 'sp_describe_pic',
  SPEAKING_RESPOND_QUESTION: 'sp_respond_q',
  SPEAKING_RESPOND_INFORMATION: 'sp_respond_info',
  SPEAKING_OPINION: 'sp_opinion',
  WRITING_PICTURE: 'w_picture',
  WRITING_EMAIL: 'w_email',
  WRITING_TEXT: 'w_text'
});

function resolveQuestionType(section, questionNo) {
  const normalizedSection = String(section || '').trim().toLowerCase();
  const number = Number.parseInt(questionNo, 10);
  if (!Number.isInteger(number) || number < 1) return null;

  if (normalizedSection === 'speaking') {
    if (number <= 2) return QUESTION_TYPES.SPEAKING_READ_ALOUD;
    if (number <= 4) return QUESTION_TYPES.SPEAKING_DESCRIBE_PICTURE;
    if (number <= 7) return QUESTION_TYPES.SPEAKING_RESPOND_QUESTION;
    if (number <= 10) return QUESTION_TYPES.SPEAKING_RESPOND_INFORMATION;
    return QUESTION_TYPES.SPEAKING_OPINION;
  }

  if (normalizedSection === 'writing') {
    if (number <= 5) return QUESTION_TYPES.WRITING_PICTURE;
    if (number <= 7) return QUESTION_TYPES.WRITING_EMAIL;
    return QUESTION_TYPES.WRITING_TEXT;
  }

  return null;
}

function resolveAnswerQuestionType(answer) {
  return resolveQuestionType(answer?.section, answer?.question_no);
}

module.exports = { QUESTION_TYPES, resolveQuestionType, resolveAnswerQuestionType };

