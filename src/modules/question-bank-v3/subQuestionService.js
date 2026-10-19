const HttpError = require('../../http/httpError');
const questions = require('./questionRepository');
const repo = require('./subQuestionRepository');
const { cleanupStorageKey } = require('./mediaService');

async function cleanup(keys = []) { await Promise.all(keys.map(cleanupStorageKey)); }

async function ensure(id, editable = false) {
  const question = await questions.findById(id);
  if (!question) throw new HttpError('Không tìm thấy câu hỏi.', 404, 'QUESTION_NOT_FOUND');
  if (editable && question.status === 'ACTIVE') throw new HttpError('Hãy chuyển câu hỏi sang Dừng hoạt động trước khi chỉnh sửa nội dung và đáp án.', 409, 'ACTIVE_QUESTION_LOCKED');
  return question;
}

function questionText(data) { return String(data.questionText ?? data.promptHtml ?? '').trim(); }

// Validate a single sub-question against the rules of its parent question type.
// Used both for direct writes and for the activation readiness check.
function validate(data, type) {
  if (!questionText(data)) throw new HttpError('Nội dung câu hỏi là bắt buộc.', 400, 'PROMPT_REQUIRED');
  if (type === 'RECORD') {
    const prep = Number(data.preparationDurationSeconds);
    const rec = Number(data.recordingDurationSeconds);
    if (!Number.isInteger(prep) || prep < 0) throw new HttpError('Thời gian chuẩn bị phải lớn hơn hoặc bằng 0.', 400, 'PREPARATION_DURATION_INVALID');
    if (!Number.isInteger(rec) || rec <= 0) throw new HttpError('Thời gian ghi âm phải lớn hơn 0.', 400, 'RECORDING_DURATION_INVALID');
    return;
  }
  if (type === 'WRITING') {
    const maxChar = Number(data.maxCharacterCount);
    const minWord = Number(data.minWordCount);
    if (!Number.isInteger(maxChar) || maxChar <= 0) throw new HttpError('Số ký tự tối đa phải lớn hơn 0.', 400, 'MAX_CHARACTER_COUNT_INVALID');
    if (!Number.isInteger(minWord) || minWord < 0) throw new HttpError('Số từ tối thiểu phải lớn hơn hoặc bằng 0.', 400, 'MIN_WORD_COUNT_INVALID');
    return;
  }
  if (!Array.isArray(data.options) || data.options.length < 2) throw new HttpError('Cần tối thiểu 2 đáp án.', 400, 'OPTIONS_MINIMUM');
  if (data.options.some(o => !String(o.optionText || '').trim())) throw new HttpError('Nội dung đáp án không được rỗng.', 400, 'OPTION_TEXT_REQUIRED');
  if (data.options.filter(o => o.isCorrect).length !== 1) throw new HttpError('Phải có chính xác 1 đáp án đúng.', 400, 'CORRECT_OPTION_REQUIRED');
}

function normalizeForType(data, type) {
  const normalized = { ...data };
  if (type !== 'MCQ_SINGLE') delete normalized.options;
  if (type !== 'RECORD') {
    normalized.preparationDurationSeconds = null;
    normalized.recordingDurationSeconds = null;
    normalized.audioMediaId = null;
  }
  if (type !== 'WRITING') {
    normalized.maxCharacterCount = null;
    normalized.minWordCount = null;
  }
  return normalized;
}

async function list(id) { await ensure(id); return repo.list(id); }

async function create(id, data) {
  const question = await ensure(id, true);
  validate(data, question.questionType);
  const subId = await repo.create(id, normalizeForType(data, question.questionType));
  return repo.find(id, subId);
}

async function update(questionId, id, data) {
  const question = await ensure(questionId, true);
  if (!await repo.find(questionId, id)) throw new HttpError('Không tìm thấy câu hỏi con.', 404, 'SUB_QUESTION_NOT_FOUND');
  validate(data, question.questionType);
  await repo.update(questionId, id, normalizeForType(data, question.questionType));
  return repo.find(questionId, id);
}

async function remove(q, id) {
  await ensure(q, true);
  const removed = await repo.remove(q, id);
  if (!removed) throw new HttpError('Không tìm thấy câu hỏi con.', 404, 'SUB_QUESTION_NOT_FOUND');
  await cleanup(removed.deletedStorageKeys);
  return { id };
}

async function reorder(q, ids) {
  await ensure(q, true);
  if (!Array.isArray(ids) || !await repo.reorder(q, ids)) throw new HttpError('Danh sách câu hỏi con không hợp lệ.', 400, 'SUB_QUESTION_ORDER_INVALID');
  return repo.list(q);
}

// Bulk-save the whole Câu hỏi tab in one transaction. Every item is validated
// against the parent question type before any write, so a single invalid item
// aborts the request and rolls back the transaction.
async function saveAll(questionId, items) {
  const question = await ensure(questionId, true);
  if (!Array.isArray(items)) throw new HttpError('Danh sách câu hỏi con không hợp lệ.', 400, 'SUB_QUESTION_ITEMS_INVALID');
  items.forEach(item => validate(item, question.questionType));
  const normalizedItems = items.map(item => normalizeForType(item, question.questionType));
  try {
    const result = await repo.saveAll(questionId, normalizedItems);
    await cleanup(result.deletedStorageKeys);
    return result.items;
  } catch (error) {
    if (error.code === 'SUB_QUESTION_NOT_IN_QUESTION') throw new HttpError('Câu hỏi con không thuộc câu hỏi này.', 400, 'SUB_QUESTION_NOT_IN_QUESTION');
    if (error.code === 'SUB_QUESTION_AUDIO_INVALID') throw new HttpError('Audio câu hỏi không hợp lệ hoặc không thuộc câu hỏi này.', 400, 'SUB_QUESTION_AUDIO_INVALID');
    throw error;
  }
}

module.exports = { list, create, update, remove, reorder, saveAll, validate, normalizeForType };
