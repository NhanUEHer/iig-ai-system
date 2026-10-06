const HttpError = require('../../http/httpError');
const { isValidExamType, isValidExamMode, EXAM_ERROR_CODES } = require('./examConstants');

const statuses = new Set(['DRAFT', 'ACTIVE', 'INACTIVE']);
const positiveInt = value => Number.isInteger(Number(value)) && Number(value) > 0;
const nonNegativeInt = value => Number.isInteger(Number(value)) && Number(value) >= 0;
const listValues = value => String(value || '').split(',').map(item => item.trim()).filter(Boolean);

function validateListFilters(query = {}) {
  const selectedStatuses = listValues(query.statuses || query.status);
  if (selectedStatuses.some(status => !statuses.has(status))) {
    throw new HttpError('Bộ lọc trạng thái đề thi không hợp lệ.', 400, 'EXAM_STATUSES_INVALID');
  }
  const selectedTypes = listValues(query.examTypes || query.examType);
  if (selectedTypes.some(type => !isValidExamType(type))) {
    throw new HttpError('Bộ lọc kiểu đề thi không hợp lệ.', 400, 'EXAM_TYPES_INVALID');
  }
}

// Exam information contract (spec §5/§6): title, status, exam type, description,
// introduction. Exam-level duration and score scale are no longer captured here.
function validateExam(data, partial = false) {
  if (!partial || data.title !== undefined) {
    if (!String(data.title || '').trim()) throw new HttpError('Tên đề thi là bắt buộc.', 400, 'EXAM_TITLE_REQUIRED');
    if (String(data.title).trim().length > 240) throw new HttpError('Tên đề thi không được vượt quá 240 ký tự.', 400, 'EXAM_TITLE_TOO_LONG');
  }
  if (data.status !== undefined && !statuses.has(data.status)) throw new HttpError('Trạng thái đề thi không hợp lệ.', 400, 'EXAM_STATUS_INVALID');
  if (!partial || data.examType !== undefined) {
    if (!data.examType) throw new HttpError('Kiểu đề thi là bắt buộc.', 400, EXAM_ERROR_CODES.EXAM_TYPE_REQUIRED);
    if (!isValidExamType(data.examType)) throw new HttpError('Kiểu đề thi không hợp lệ.', 400, EXAM_ERROR_CODES.EXAM_TYPE_INVALID);
  } else if (data.examType !== undefined && !isValidExamType(data.examType)) {
    throw new HttpError('Kiểu đề thi không hợp lệ.', 400, EXAM_ERROR_CODES.EXAM_TYPE_INVALID);
  }
  if (data.description !== undefined && String(data.description || '').length > 500) throw new HttpError('Mô tả đề thi không được vượt quá 500 ký tự.', 400, 'EXAM_DESCRIPTION_TOO_LONG');
  if (data.introduction !== undefined && String(data.introduction || '').length > 5000) throw new HttpError('Giới thiệu và hướng dẫn không được vượt quá 5000 ký tự.', 400, 'EXAM_INTRODUCTION_TOO_LONG');
}

// Section contract (spec §8/§9). Mode compatibility with the exam type is
// enforced in the service where the exam type is known.
function validateSection(data, partial = false) {
  if (!partial || data.title !== undefined) {
    if (!String(data.title || '').trim()) throw new HttpError('Tên Phần thi là bắt buộc.', 400, 'SECTION_TITLE_REQUIRED');
    if (String(data.title).trim().length > 150) throw new HttpError('Tên Phần thi không được vượt quá 150 ký tự.', 400, 'SECTION_TITLE_TOO_LONG');
  }
  if (!partial || data.examMode !== undefined) {
    if (!isValidExamMode(data.examMode)) throw new HttpError('Kiểu thi không hợp lệ.', 400, EXAM_ERROR_CODES.SECTION_MODE_INVALID);
  }
  if (!partial || data.questionCount !== undefined) {
    if (!positiveInt(data.questionCount)) throw new HttpError('Số câu hỏi phải là số nguyên dương.', 400, 'SECTION_QUESTION_COUNT_INVALID');
  }
  if (!partial || data.configuredDurationSeconds !== undefined) {
    if (!positiveInt(data.configuredDurationSeconds)) throw new HttpError('Thời gian cấu hình phải lớn hơn 0.', 400, 'SECTION_DURATION_INVALID');
  }
}

// Part creation needs only a title (spec §12).
function validatePartCreate(data) {
  if (!String(data.title || '').trim()) throw new HttpError('Tên Part là bắt buộc.', 400, 'PART_TITLE_REQUIRED');
  if (String(data.title).trim().length > 150) throw new HttpError('Tên Part không được vượt quá 150 ký tự.', 400, 'PART_TITLE_TOO_LONG');
}

// Part content (spec §13). Instruction, audio and break are all optional for a
// draft; only their shape is validated here.
function validatePartContent(data) {
  if (data.title !== undefined) validatePartCreate(data);
  if (data.instructionHtml !== undefined && String(data.instructionHtml || '').length > 5000) {
    throw new HttpError('Hướng dẫn Part không được vượt quá 5000 ký tự.', 400, 'PART_INSTRUCTION_TOO_LONG');
  }
  if (data.breakDurationSeconds !== undefined && !nonNegativeInt(data.breakDurationSeconds)) {
    throw new HttpError('Thời gian nghỉ không được âm.', 400, 'PART_BREAK_DURATION_INVALID');
  }
  if (data.configuredDurationSeconds !== undefined && !nonNegativeInt(data.configuredDurationSeconds)) {
    throw new HttpError('Thời gian làm bài của Part không được âm.', 400, 'PART_DURATION_INVALID');
  }
}

module.exports = { validateExam, validateListFilters, validateSection, validatePartCreate, validatePartContent };
