const HttpError = require('../../http/httpError');

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = new Set(['DRAFT', 'ACTIVE', 'INACTIVE']);
const integer = value => Number.isInteger(Number(value));

function validateBase(data, partial = false) {
  if (!partial || data.name !== undefined) {
    if (!String(data.name || '').trim()) throw new HttpError('Tên thang điểm là bắt buộc.', 400, 'SCORE_SCALE_NAME_REQUIRED');
    if (String(data.name).trim().length > 255) throw new HttpError('Tên thang điểm không được vượt quá 255 ký tự.', 400, 'SCORE_SCALE_NAME_TOO_LONG');
  }
  if (!partial || data.questionCount !== undefined) {
    if (data.questionCount === '' || data.questionCount == null || !integer(data.questionCount) || Number(data.questionCount) <= 0) throw new HttpError('Số câu hỏi phải là số nguyên dương.', 400, 'SCORE_SCALE_QUESTION_COUNT_INVALID');
  }
  for (const field of ['minScore', 'maxScore', 'scoreStep']) {
    if (!partial || data[field] !== undefined) {
      if (data[field] === '' || data[field] == null || !Number.isFinite(Number(data[field])) || Number(data[field]) < 0) throw new HttpError(`${field} không hợp lệ.`, 400, 'SCORE_SCALE_RANGE_INVALID');
    }
  }
  const min = data.minScore === undefined ? null : Number(data.minScore);
  const max = data.maxScore === undefined ? null : Number(data.maxScore);
  if (min !== null && max !== null && min > max) throw new HttpError('Điểm tối thiểu không được lớn hơn điểm tối đa.', 400, 'SCORE_SCALE_RANGE_INVALID');
  if (data.scoreStep !== undefined && Number(data.scoreStep) <= 0) throw new HttpError('Khoảng cách dãy điểm phải lớn hơn 0.', 400, 'SCORE_SCALE_STEP_INVALID');
  if (data.status !== undefined && !statuses.has(data.status)) throw new HttpError('Trạng thái thang điểm không hợp lệ.', 400, 'SCORE_SCALE_STATUS_INVALID');
}

function validateRanges(data) {
  const count = Number(data.questionCount);
  if (!Array.isArray(data.rawRanges) || data.rawRanges.length !== count + 1) throw new HttpError(`Cần nhập đủ mapping từ 0 đến ${count} câu đúng.`, 400, 'SCORE_SCALE_RANGES_INCOMPLETE');
  const seen = new Set();
  for (const row of data.rawRanges) {
    if (!integer(row.correctCount) || Number(row.correctCount) < 0 || Number(row.correctCount) > count || seen.has(Number(row.correctCount))) throw new HttpError('Mapping số câu đúng không hợp lệ hoặc bị trùng.', 400, 'SCORE_SCALE_RANGES_INVALID');
    const score = Number(row.convertedScore);
    if (!Number.isFinite(score) || score < Number(data.minScore) || score > Number(data.maxScore)) throw new HttpError('Điểm quy đổi phải nằm trong khoảng điểm của thang.', 400, 'SCORE_SCALE_CONVERTED_SCORE_INVALID');
    seen.add(Number(row.correctCount));
  }
}

function validateCreate(data) {
  validateBase(data);
  if (data.rawRanges !== undefined) validateRanges(data);
}
function validateUpdate(data) {
  validateBase(data, true);
  if (data.rawRanges !== undefined) {
    if (!Array.isArray(data.rawRanges) || data.rawRanges.some(row => !integer(row.correctCount) || Number(row.correctCount) < 0 || !Number.isFinite(Number(row.convertedScore)))) {
      throw new HttpError('Mapping thang điểm không hợp lệ.', 400, 'SCORE_SCALE_RANGES_INVALID');
    }
  }
}
function validateId(id) { if (!uuid.test(String(id || ''))) throw new HttpError('ID thang điểm không hợp lệ.', 400, 'SCORE_SCALE_ID_INVALID'); }

module.exports = { validateCreate, validateUpdate, validateId };
