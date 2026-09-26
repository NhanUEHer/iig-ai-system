const assert = require('node:assert/strict');
const test = require('node:test');

const HttpError = require('../src/http/httpError');
const validator = require('../src/modules/exams/examValidator');
const repository = require('../src/modules/exams/examRepository');
const service = require('../src/modules/exams/examService');

const validExam = {
  title: 'TOEIC Full Test 01',
  status: 'DRAFT',
  durationSeconds: 7200,
  scoreScale: 100,
  introduction: '<p>Đọc kỹ hướng dẫn trước khi làm bài.</p>',
};

test('exam V3 validator enforces the current exam contract', () => {
  assert.throws(() => validator.validateExam({ ...validExam, title: '' }), error => error instanceof HttpError && error.code === 'EXAM_TITLE_REQUIRED');
  assert.throws(() => validator.validateExam({ ...validExam, status: 'PENDING' }), error => error instanceof HttpError && error.code === 'EXAM_STATUS_INVALID');
  assert.throws(() => validator.validateExam({ ...validExam, durationSeconds: 0 }), error => error instanceof HttpError && error.code === 'EXAM_DURATION_INVALID');
  assert.throws(() => validator.validateExam({ ...validExam, introduction: '<p>&nbsp;</p>' }), error => error instanceof HttpError && error.code === 'EXAM_INTRODUCTION_REQUIRED');
  assert.doesNotThrow(() => validator.validateExam(validExam));
});

test('exam V3 part validator requires title and instruction', () => {
  assert.throws(() => validator.validatePart({ title: '', instruction: 'Hướng dẫn' }), error => error instanceof HttpError && error.code === 'PART_TITLE_REQUIRED');
  assert.throws(() => validator.validatePart({ title: 'Listening', instruction: '<p>&nbsp;</p>' }), error => error instanceof HttpError && error.code === 'PART_INSTRUCTION_REQUIRED');
  assert.throws(() => validator.validatePart({ title: 'Listening', instruction: 'Hướng dẫn', durationMinutes: -1 }), error => error instanceof HttpError && error.code === 'PART_DURATION_INVALID');
  assert.doesNotThrow(() => validator.validatePart({ title: 'Listening', instruction: '<p>Nghe và chọn đáp án.</p>', durationMinutes: 45 }));
});

test('exam V3 repository maps database rows to the active API shape', () => {
  const exam = repository.mapExam({
    id: '11111111-1111-4111-8111-111111111111', exam_code: 'EX-0001', title: 'Exam', status: 'DRAFT',
    duration_minutes: 60, duration_seconds: 30, points_per_question: 10, score_scale: 100,
    part_count: '2', parent_question_count: '3', sub_question_count: '4', total_points: '40', lock_version: '1',
  });
  assert.equal(exam.examCode, 'EX-0001');
  assert.equal(exam.durationSeconds, 3630);
  assert.equal(exam.partCount, 2);
  assert.equal(exam.subQuestionCount, 4);
  assert.equal(exam.totalPoints, 40);
});

test('exam V3 service rejects direct ACTIVE creation', async () => {
  await assert.rejects(() => service.create({ ...validExam, status: 'ACTIVE' }), error => error instanceof HttpError && error.code === 'USE_ACTIVATE_ENDPOINT');
});

test('exam V3 protects exams referenced by an exam event', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/exams/examService.js'), 'utf8');
  assert.match(source, /SELECT 1 FROM exam_events WHERE exam_id=\$1/);
  assert.match(source, /EXAM_IN_USE/);
});

test('exam V3 blocks deactivation while a published event is in progress', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const serviceSource = fs.readFileSync(path.join(__dirname, '../src/modules/exams/examService.js'), 'utf8');
  const repositorySource = fs.readFileSync(path.join(__dirname, '../src/modules/exams/examRepository.js'), 'utf8');
  assert.match(serviceSource, /findInProgressEvent\(examId\)/);
  assert.match(serviceSource, /EXAM_EVENT_IN_PROGRESS/);
  assert.match(repositorySource, /status='PUBLISHED'/);
  assert.match(repositorySource, /start_at<=CURRENT_TIMESTAMP/);
  assert.match(repositorySource, /end_at>CURRENT_TIMESTAMP/);
});

test('exam edit page exposes activate and deactivate lifecycle actions', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../frontend/src/features/exams/pages/ExamEditPage.jsx'), 'utf8');
  assert.match(source, /deactivateExam/);
  assert.match(source, /Ngừng hoạt động để chỉnh sửa/);
  assert.match(source, /activateExam/);
  assert.match(source, /Kích hoạt đề thi/);
  assert.match(source, /Đề thi chưa đủ điều kiện kích hoạt/);
});

test('exam V3 routes register specific operations before dynamic detail route', () => {
  const routes = require('../src/routes/examV3Routes').stack.map(layer => layer.route?.path).filter(Boolean);
  const detail = routes.indexOf('/:examId');
  for (const path of ['/:examId/available-questions', '/:examId/validation', '/:examId/activate', '/:examId/parts/reorder', '/:examId/parts/:partId/questions/reorder']) {
    assert.ok(routes.includes(path), `${path} must exist`);
    assert.ok(routes.indexOf(path) < detail, `${path} must precede /:examId`);
  }
});

test('exam permissions remain available in the permission catalog', () => {
  const { ALL_PERMISSIONS } = require('../src/modules/auth/permissions');
  assert.ok(ALL_PERMISSIONS.includes('exams.view'));
  assert.ok(ALL_PERMISSIONS.includes('exams.manage'));
});
