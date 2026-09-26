const HttpError = require('../../http/httpError');

const statuses = new Set(['DRAFT', 'ACTIVE', 'INACTIVE']);
const positiveInt = value => Number.isInteger(Number(value)) && Number(value) > 0;

function validateExam(data, partial = false) {
  if (!partial || data.title !== undefined) {
    if (!String(data.title || '').trim()) throw new HttpError('Tên đề thi là bắt buộc.', 400, 'EXAM_TITLE_REQUIRED');
    if (String(data.title).trim().length > 240) throw new HttpError('Tên đề thi không được vượt quá 240 ký tự.', 400, 'EXAM_TITLE_TOO_LONG');
  }
  if (data.status !== undefined && !statuses.has(data.status)) throw new HttpError('Trạng thái đề thi không hợp lệ.', 400, 'EXAM_STATUS_INVALID');
  if (data.examCode !== undefined && String(data.examCode || '').trim() && !/^[A-Z0-9_-]{3,32}$/i.test(String(data.examCode).trim())) throw new HttpError('Mã đề thi chỉ gồm chữ, số, dấu gạch ngang hoặc gạch dưới và dài từ 3 đến 32 ký tự.', 400, 'EXAM_CODE_INVALID');
  if (data.scoreScale !== undefined && (!Number.isFinite(Number(data.scoreScale)) || Number(data.scoreScale) <= 0)) throw new HttpError('Thang điểm phải lớn hơn 0.', 400, 'EXAM_SCORE_SCALE_INVALID');
  if (!partial || data.durationSeconds !== undefined) {
    if (!positiveInt(data.durationSeconds)) throw new HttpError('Thời gian làm bài phải lớn hơn 0.', 400, 'EXAM_DURATION_INVALID');
  }
  for (const [field, label, limit] of [['description', 'Mô tả đề thi', 500], ['introduction', 'Giới thiệu và hướng dẫn', 5000]]) {
    if (data[field] !== undefined && String(data[field] || '').length > limit) throw new HttpError(`${label} không được vượt quá ${limit} ký tự.`, 400, `EXAM_${field.toUpperCase()}_TOO_LONG`);
  }
  if (!partial || data.introduction !== undefined) {
    const introductionText = String(data.introduction || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (!introductionText) throw new HttpError('Giới thiệu và hướng dẫn làm bài là bắt buộc.', 400, 'EXAM_INTRODUCTION_REQUIRED');
  }
}

function validatePart(data) {
  if (!String(data.title || '').trim()) throw new HttpError('Tên phần là bắt buộc.', 400, 'PART_TITLE_REQUIRED');
  if (String(data.title).trim().length > 150) throw new HttpError('Tên phần không được vượt quá 150 ký tự.', 400, 'PART_TITLE_TOO_LONG');
  if (data.durationMinutes !== undefined && (!Number.isInteger(Number(data.durationMinutes)) || Number(data.durationMinutes) < 0)) throw new HttpError('Thời lượng phần thi không hợp lệ.', 400, 'PART_DURATION_INVALID');
  if (String(data.partLabel || '').length > 120) throw new HttpError('Nhãn phần thi không được vượt quá 120 ký tự.', 400, 'PART_LABEL_TOO_LONG');
  if (String(data.instruction || '').length > 2000) throw new HttpError('Hướng dẫn phần thi không được vượt quá 2000 ký tự.', 400, 'PART_INSTRUCTION_TOO_LONG');
  const instructionText = String(data.instruction || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  if (!instructionText) throw new HttpError('Hướng dẫn phần thi là bắt buộc.', 400, 'PART_INSTRUCTION_REQUIRED');
}

module.exports = { validateExam, validatePart };
