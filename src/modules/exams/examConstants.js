// Shared enums and the exam-type -> exam-mode compatibility matrix for Exam
// Management. Frontend and backend must agree on these values; the backend is
// the authority that enforces them.

const EXAM_TYPES = ['LISTENING_READING', 'READING', 'LISTENING', 'SPEAKING_WRITING', 'SPEAKING', 'WRITING'];

const EXAM_MODES = ['FREESTYLE', 'NON_STOP', 'RECORD_NON_STOP', 'WRITING_NON_STOP'];

// Which section exam modes each exam type may contain.
const EXAM_TYPE_MODES = {
  LISTENING: ['NON_STOP'],
  READING: ['FREESTYLE'],
  LISTENING_READING: ['NON_STOP', 'FREESTYLE'],
  SPEAKING: ['RECORD_NON_STOP'],
  WRITING: ['WRITING_NON_STOP'],
  SPEAKING_WRITING: ['RECORD_NON_STOP', 'WRITING_NON_STOP'],
};

// The parent-question type each mode consumes from the question bank.
const MODE_QUESTION_TYPE = {
  FREESTYLE: 'MCQ_SINGLE',
  NON_STOP: 'MCQ_SINGLE',
  RECORD_NON_STOP: 'RECORD',
  WRITING_NON_STOP: 'WRITING',
};

// Modes whose actual duration is computed dynamically (Listening / Speaking).
const TIMED_MODES = new Set(['NON_STOP', 'RECORD_NON_STOP']);

const EXAM_ERROR_CODES = {
  EXAM_TYPE_INVALID: 'EXAM_TYPE_INVALID',
  EXAM_TYPE_REQUIRED: 'EXAM_TYPE_REQUIRED',
  EXAM_TYPE_IMMUTABLE_WITH_SECTIONS: 'EXAM_TYPE_IMMUTABLE_WITH_SECTIONS',
  SECTION_MODE_INVALID: 'SECTION_MODE_INVALID',
  SECTION_MODE_INCOMPATIBLE: 'SECTION_MODE_INCOMPATIBLE',
  SECTION_NOT_FOUND: 'SECTION_NOT_FOUND',
  PART_NOT_FOUND: 'PART_NOT_FOUND',
  PART_AUDIO_INVALID: 'PART_AUDIO_INVALID',
  QUESTION_NOT_ELIGIBLE: 'QUESTION_NOT_ELIGIBLE',
  QUESTION_ALREADY_ADDED: 'QUESTION_ALREADY_ADDED',
  DUPLICATE_QUESTIONS: 'DUPLICATE_QUESTIONS',
  INVALID_REORDER: 'INVALID_REORDER',
  EXAM_NOT_READY: 'EXAM_NOT_READY',
};

function isValidExamType(value) { return EXAM_TYPES.includes(value); }
function isValidExamMode(value) { return EXAM_MODES.includes(value); }
function modesForExamType(examType) { return EXAM_TYPE_MODES[examType] || []; }
function isModeCompatible(examType, examMode) { return modesForExamType(examType).includes(examMode); }

module.exports = {
  EXAM_TYPES,
  EXAM_MODES,
  EXAM_TYPE_MODES,
  MODE_QUESTION_TYPE,
  TIMED_MODES,
  EXAM_ERROR_CODES,
  isValidExamType,
  isValidExamMode,
  modesForExamType,
  isModeCompatible,
};
