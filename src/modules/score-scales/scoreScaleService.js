const HttpError = require('../../http/httpError');
const repository = require('./scoreScaleRepository');
const validator = require('./scoreScaleValidator');

async function list(query = {}) {
  if (query.questionCount !== undefined && query.questionCount !== '') {
    const questionCount = Number(query.questionCount);
    if (!Number.isInteger(questionCount) || questionCount <= 0) throw new HttpError('Số câu hỏi dùng để lọc thang điểm không hợp lệ.', 400, 'SCORE_SCALE_QUESTION_COUNT_FILTER_INVALID');
  }
  return repository.list(query);
}
async function get(id) { validator.validateId(id); const value = await repository.findById(id); if (!value) throw new HttpError('Không tìm thấy thang điểm.', 404, 'SCORE_SCALE_NOT_FOUND'); return value; }
async function create(data, userId) { validator.validateCreate(data); return repository.create(data, userId); }
async function update(id, data, userId) {
  validator.validateId(id); validator.validateUpdate(data);
  const current = await repository.findById(id);
  if (!current) throw new HttpError('Không tìm thấy thang điểm.', 404, 'SCORE_SCALE_NOT_FOUND');
  if (current.status !== 'DRAFT' || current.usageCount > 0) throw new HttpError('Thang điểm đã sử dụng hoặc đã kích hoạt, không thể chỉnh sửa.', 409, 'SCORE_SCALE_IMMUTABLE');
  const merged = { ...current, ...data };
  validator.validateCreate({ ...merged, rawRanges: undefined });
  if (data.rawRanges !== undefined) {
    validator.validateCreate({ ...merged, rawRanges: data.rawRanges });
  }
  try { const value = await repository.update(id, data, userId); if (!value) throw new HttpError('Không tìm thấy thang điểm.', 404, 'SCORE_SCALE_NOT_FOUND'); return value; } catch (error) { if (error.message === 'SCORE_SCALE_IMMUTABLE') throw new HttpError('Thang điểm đã sử dụng hoặc đã kích hoạt, không thể chỉnh sửa.', 409, 'SCORE_SCALE_IMMUTABLE'); throw error; }
}
async function setStatus(id, status, userId) {
  validator.validateId(id); validator.validateUpdate({ status });
  const current = await repository.findById(id);
  if (!current) throw new HttpError('Không tìm thấy thang điểm.', 404, 'SCORE_SCALE_NOT_FOUND');
  if (status === 'DRAFT' && (current.status !== 'DRAFT' || current.usageCount > 0)) {
    throw new HttpError('Thang điểm đã kích hoạt hoặc đã sử dụng không thể chuyển về bản nháp.', 409, 'SCORE_SCALE_DRAFT_RESTORE_FORBIDDEN');
  }
  if (status === 'ACTIVE') {
    try { validator.validateCreate({ ...current, rawRanges: current.rawRanges }); }
    catch (error) {
      if (error instanceof HttpError) throw new HttpError(error.message, 409, error.code);
      throw error;
    }
  }
  const value = await repository.setStatus(id, status, userId);
  if (!value) throw new HttpError('Không tìm thấy thang điểm.', 404, 'SCORE_SCALE_NOT_FOUND');
  return value;
}
async function remove(id) { validator.validateId(id); const value = await repository.remove(id); if (!value) throw new HttpError('Chỉ có thể xóa thang điểm nháp chưa được sử dụng.', 409, 'SCORE_SCALE_DELETE_NOT_ALLOWED'); return value; }
module.exports = { list, get, create, update, setStatus, remove };
