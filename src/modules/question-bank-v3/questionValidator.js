const HttpError = require('../../http/httpError');
const ALLOWED_STATUS = new Set(['DRAFT', 'ACTIVE', 'INACTIVE']);
const ALLOWED_TYPES = new Set(['MCQ_SINGLE', 'RECORD', 'WRITING']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateQuestionInput(input = {}, partial = false) {
  if (!partial) {
    if (!String(input.questionName || '').trim()) throw new HttpError('Tên câu hỏi là bắt buộc.', 400, 'QUESTION_NAME_REQUIRED');
    if (!input.groupId) throw new HttpError('Nhóm câu hỏi là bắt buộc.', 400, 'GROUP_REQUIRED');
    if (!ALLOWED_TYPES.has(input.questionType)) throw new HttpError('Loại câu hỏi không hợp lệ.', 400, 'QUESTION_TYPE_INVALID');
  }
  if (input.questionName !== undefined && (!String(input.questionName).trim() || String(input.questionName).length > 240)) throw new HttpError('Tên câu hỏi không hợp lệ.', 400, 'QUESTION_NAME_INVALID');
  if (input.questionType !== undefined && !ALLOWED_TYPES.has(input.questionType)) throw new HttpError('Loại câu hỏi không hợp lệ.', 400, 'QUESTION_TYPE_INVALID');
  if (input.groupId !== undefined && !UUID_PATTERN.test(String(input.groupId))) throw new HttpError('Nhóm câu hỏi không hợp lệ.', 400, 'GROUP_ID_INVALID');
  if (input.status !== undefined && !ALLOWED_STATUS.has(input.status)) throw new HttpError('Trạng thái không hợp lệ.', 400, 'STATUS_INVALID');
  return true;
}

module.exports = { validateQuestionInput, ALLOWED_STATUS, ALLOWED_TYPES, UUID_PATTERN };
