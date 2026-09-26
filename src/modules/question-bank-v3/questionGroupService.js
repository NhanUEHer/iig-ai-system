const HttpError = require('../../http/httpError');
const repo = require('./questionGroupRepository');

const STATUSES = new Set(['DRAFT', 'ACTIVE', 'INACTIVE']);

function validate(data = {}, partial = false) {
  if (!partial || data.name !== undefined) {
    const name = String(data.name || '').trim();
    if (!name) throw new HttpError('Tên nhóm câu hỏi là bắt buộc.', 400, 'QUESTION_GROUP_NAME_REQUIRED');
    if (name.length > 240) throw new HttpError('Tên nhóm câu hỏi không được vượt quá 240 ký tự.', 400, 'QUESTION_GROUP_NAME_TOO_LONG');
  }
  if (data.description !== undefined && String(data.description || '').length > 2000) throw new HttpError('Mô tả nhóm không được vượt quá 2000 ký tự.', 400, 'QUESTION_GROUP_DESCRIPTION_TOO_LONG');
  if (data.status !== undefined && !STATUSES.has(data.status)) throw new HttpError('Trạng thái nhóm không hợp lệ.', 400, 'QUESTION_GROUP_STATUS_INVALID');
}

async function get(id) {
  const group = await repo.find(id);
  if (!group) throw new HttpError('Không tìm thấy nhóm câu hỏi.', 404, 'QUESTION_GROUP_NOT_FOUND');
  return group;
}

async function create(data, userId) { validate(data); return repo.create(data, userId); }
async function update(id, data, userId) {
  await get(id);
  validate(data, true);
  if (data.status && data.status !== 'ACTIVE' && await repo.countActiveQuestions(id) > 0) {
    throw new HttpError('Không thể ngừng hoạt động nhóm khi vẫn còn câu hỏi đang hoạt động. Hãy chuyển các câu hỏi sang nhóm khác hoặc ngừng hoạt động câu hỏi trước.', 409, 'QUESTION_GROUP_HAS_ACTIVE_QUESTIONS');
  }
  return repo.update(id, data, userId);
}
async function remove(id) {
  const group = await get(id);
  if (group.questionCount > 0) throw new HttpError('Không thể xóa nhóm đang liên kết với câu hỏi.', 409, 'QUESTION_GROUP_IN_USE');
  await repo.remove(id);
  return { id };
}

module.exports = { list: repo.list, get, previewNextCode: repo.peekNextCode, create, update, remove };
