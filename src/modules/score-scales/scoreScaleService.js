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
  if (data.rawRanges !== undefined) {
    const current = await repository.findById(id);
    if (!current) throw new HttpError('Không tìm thấy thang điểm.', 404, 'SCORE_SCALE_NOT_FOUND');
    validator.validateCreate({ ...current, ...data, rawRanges: data.rawRanges });
  }
  try { const value = await repository.update(id, data, userId); if (!value) throw new HttpError('Không tìm thấy thang điểm.', 404, 'SCORE_SCALE_NOT_FOUND'); return value; } catch (error) { if (error.message === 'SCORE_SCALE_IMMUTABLE') throw new HttpError('Thang điểm đã sử dụng hoặc đã kích hoạt, không thể chỉnh sửa.', 409, 'SCORE_SCALE_IMMUTABLE'); throw error; }
}
async function setStatus(id, status, userId) {
  validator.validateId(id); validator.validateUpdate({ status });
  if (status === 'ACTIVE') {
    const current = await repository.findById(id);
    if (!current) throw new HttpError('Không tìm thấy thang điểm.', 404, 'SCORE_SCALE_NOT_FOUND');
    if (current.rawRanges.length !== current.questionCount + 1) throw new HttpError('Cần thiết lập đầy đủ chi tiết thang điểm trước khi kích hoạt.', 409, 'SCORE_SCALE_RANGES_INCOMPLETE');
  }
  const value = await repository.setStatus(id, status, userId);
  if (!value) throw new HttpError('Không tìm thấy thang điểm.', 404, 'SCORE_SCALE_NOT_FOUND');
  return value;
}
async function remove(id) { validator.validateId(id); const value = await repository.remove(id); if (!value) throw new HttpError('Chỉ có thể xóa thang điểm nháp chưa được sử dụng.', 409, 'SCORE_SCALE_DELETE_NOT_ALLOWED'); return value; }
module.exports = { list, get, create, update, setStatus, remove };
