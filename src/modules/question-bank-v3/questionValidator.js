const HttpError = require('../../http/httpError');
const ALLOWED_STATUS = new Set(['DRAFT','ACTIVE','INACTIVE']);
function validateQuestionInput(input = {}, partial = false) {
  if (!partial && !String(input.questionName || '').trim()) throw new HttpError('Tên câu hỏi là bắt buộc.',400,'QUESTION_NAME_REQUIRED');
  if (!partial && !input.groupId) throw new HttpError('Nhóm câu hỏi là bắt buộc.',400,'GROUP_REQUIRED');
  if (input.questionName !== undefined && (!String(input.questionName).trim() || String(input.questionName).length > 240)) throw new HttpError('Tên câu hỏi không hợp lệ.',400,'QUESTION_NAME_INVALID');
  if (input.questionType !== undefined && !['MCQ_SINGLE','RECORD','WRITING'].includes(input.questionType)) throw new HttpError('Loại câu hỏi không hợp lệ.',400,'QUESTION_TYPE_INVALID');
  if (input.status !== undefined && !ALLOWED_STATUS.has(input.status)) throw new HttpError('Trạng thái không hợp lệ.',400,'STATUS_INVALID');
  return true;
}
module.exports = { validateQuestionInput };
