const HttpError = require('../../http/httpError');
const question = require('./questionRepository');
const repo = require('./contentRepository');
const { cleanupStorageKey } = require('./mediaService');

async function cleanup(keys = []) { await Promise.all(keys.map(cleanupStorageKey)); }

const validate = data => {
  if (data.title !== undefined && !String(data.title).trim()) throw new HttpError('Tiêu đề Content là bắt buộc.', 400, 'CONTENT_TITLE_REQUIRED');
};

async function ensureQuestion(id, editable = false) {
  const item = await question.findById(id);
  if (!item) throw new HttpError('Không tìm thấy câu hỏi.', 404, 'QUESTION_NOT_FOUND');
  if (editable && item.status === 'ACTIVE') throw new HttpError('Hãy chuyển câu hỏi sang Dừng hoạt động trước khi chỉnh sửa nội dung.', 409, 'ACTIVE_QUESTION_LOCKED');
  return item;
}

async function list(id) { await ensureQuestion(id); return repo.list(id); }

async function create(id, data) { await ensureQuestion(id, true); validate(data); return repo.create(id, data); }

async function update(questionId, id, data) {
  await ensureQuestion(questionId, true);
  const existing = await repo.find(id, questionId);
  if (!existing) throw new HttpError('Không tìm thấy Content.', 404, 'CONTENT_NOT_FOUND');
  validate(data);
  return repo.update(id, questionId, data);
}

async function remove(questionId, id) {
  await ensureQuestion(questionId, true);
  const existing = await repo.find(id, questionId);
  if (!existing) throw new HttpError('Không tìm thấy Content.', 404, 'CONTENT_NOT_FOUND');
  const removed = await repo.remove(id, questionId);
  await cleanup(removed.deletedStorageKeys);
  return { id };
}

async function reorder(questionId, ids) {
  await ensureQuestion(questionId, true);
  if (!Array.isArray(ids) || ids.length === 0) throw new HttpError('Danh sách Content không hợp lệ.', 400, 'CONTENT_ORDER_INVALID');
  if (!await repo.reorder(questionId, ids)) throw new HttpError('Danh sách Content phải chứa đúng các Content thuộc câu hỏi.', 400, 'CONTENT_ORDER_INVALID');
  return repo.list(questionId);
}

// Bulk-save the whole Content tab in one transaction.
async function saveAll(questionId, items) {
  await ensureQuestion(questionId, true);
  if (!Array.isArray(items)) throw new HttpError('Danh sách Content không hợp lệ.', 400, 'CONTENT_ITEMS_INVALID');
  items.forEach(item => {
    if (!String(item?.title || '').trim()) throw new HttpError('Tiêu đề Content là bắt buộc.', 400, 'CONTENT_TITLE_REQUIRED');
  });
  try {
    const result = await repo.saveAll(questionId, items);
    await cleanup(result.deletedStorageKeys);
    return result.items;
  } catch (error) {
    if (error.code === 'CONTENT_NOT_IN_QUESTION') throw new HttpError('Content không thuộc câu hỏi này.', 400, 'CONTENT_NOT_IN_QUESTION');
    if (error.code === 'CONTENT_MEDIA_INVALID') throw new HttpError('Media không hợp lệ, sai loại hoặc không thuộc câu hỏi này.', 400, 'CONTENT_MEDIA_INVALID');
    throw error;
  }
}

module.exports = { list, create, update, remove, reorder, saveAll };
