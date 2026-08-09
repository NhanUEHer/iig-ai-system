export function getQuestionType(answer) {
  const section = String(answer?.section || '').toLowerCase();
  const questionNo = Number.parseInt(answer?.question_no, 10);
  if (!Number.isInteger(questionNo) || questionNo < 1) return null;

  if (section === 'writing') {
    if (questionNo <= 5) return 'w_picture';
    if (questionNo <= 7) return 'w_email';
    return 'w_text';
  }
  if (section === 'speaking') {
    if (questionNo <= 2) return 'sp_read_aloud';
    if (questionNo <= 4) return 'sp_describe_pic';
    if (questionNo <= 7) return 'sp_respond_q';
    if (questionNo <= 10) return 'sp_respond_info';
    return 'sp_opinion';
  }
  return null;
}

