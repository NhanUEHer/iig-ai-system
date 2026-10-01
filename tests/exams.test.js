const assert = require('node:assert/strict');
const test = require('node:test');

const HttpError = require('../src/http/httpError');
const validator = require('../src/modules/exams/examValidator');
const repository = require('../src/modules/exams/examRepository');
const service = require('../src/modules/exams/examService');

const validExam = {
  title: 'TOEIC Full Test 01',
  status: 'DRAFT',
  examType: 'LISTENING_READING',
  introduction: '<p>Đọc kỹ hướng dẫn trước khi làm bài.</p>',
};

test('exam validator enforces the redesigned exam contract', () => {
  assert.throws(() => validator.validateExam({ ...validExam, title: '' }), error => error instanceof HttpError && error.code === 'EXAM_TITLE_REQUIRED');
  assert.throws(() => validator.validateExam({ ...validExam, status: 'PENDING' }), error => error instanceof HttpError && error.code === 'EXAM_STATUS_INVALID');
  assert.throws(() => validator.validateExam({ ...validExam, examType: 'UNKNOWN' }), error => error instanceof HttpError && error.code === 'EXAM_TYPE_INVALID');
  assert.doesNotThrow(() => validator.validateExam({ ...validExam, introduction: '<p>&nbsp;</p>' }));
  assert.doesNotThrow(() => validator.validateExam({ ...validExam, introduction: undefined }));
  assert.doesNotThrow(() => validator.validateExam(validExam));
});

test('exam repository maps exam type and structural counts to the API shape', () => {
  const exam = repository.mapExam({
    id: '11111111-1111-4111-8111-111111111111', exam_code: 'EX-0001', title: 'Exam', status: 'DRAFT',
    exam_type: 'LISTENING', published_snapshot: null,
    section_count: '2', part_count: '3', parent_question_count: '4', sub_question_count: '20', configured_duration_seconds: '3600', lock_version: '1',
  });
  assert.equal(exam.examCode, 'EX-0001');
  assert.equal(exam.examType, 'LISTENING');
  assert.equal(exam.sectionCount, 2);
  assert.equal(exam.partCount, 3);
  assert.equal(exam.subQuestionCount, 20);
  assert.equal(exam.configuredDurationSeconds, 3600);
  assert.equal(exam.hasPublishedSnapshot, false);
});

test('exam list filters reject unsupported statuses and exam types', () => {
  assert.throws(() => validator.validateListFilters({ statuses: 'DRAFT,DELETED' }), error => error.code === 'EXAM_STATUSES_INVALID');
  assert.throws(() => validator.validateListFilters({ examTypes: 'LISTENING,TOEFL' }), error => error.code === 'EXAM_TYPES_INVALID');
  assert.doesNotThrow(() => validator.validateListFilters({ statuses: 'DRAFT,ACTIVE', examTypes: 'LISTENING,READING' }));
});

test('exam list statistics avoid cross-join multiplication and include configured duration', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/exams/examRepository.js'), 'utf8');
  assert.match(source, /SELECT COUNT\(\*\) FROM exam_sections es WHERE es\.exam_id=e\.id/);
  assert.match(source, /SUM\(es\.configured_duration_seconds\)/);
  assert.doesNotMatch(source, /LEFT JOIN exam_sections es ON es\.exam_id=e\.id/);
});

test('exam service protects exams referenced by an exam event', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/exams/examService.js'), 'utf8');
  assert.match(source, /SELECT 1 FROM exam_events WHERE exam_id=\$1/);
  assert.match(source, /EXAM_IN_USE/);
});

test('exam service blocks deactivation while a published event is in progress', () => {
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

test('exam service uses Publish (not a form status change) to activate', async () => {
  const repo = require('../src/modules/exams/examRepository');
  const original = repo.findById;
  repo.findById = async () => ({ id: 'e1', status: 'DRAFT', examType: 'LISTENING', introduction: '<p>x</p>', title: 'E', sections: [], legacyParts: [] });
  try {
    await assert.rejects(() => service.update('e1', { status: 'ACTIVE' }, 'u1'), error => error instanceof HttpError && error.code === 'USE_PUBLISH_ENDPOINT');
  } finally { repo.findById = original; }
});

test('exam V3 routes register specific operations before the dynamic detail route', () => {
  const routes = require('../src/routes/examV3Routes').stack.map(layer => layer.route?.path).filter(Boolean);
  const detail = routes.indexOf('/:examId');
  for (const path of ['/:examId/sections', '/:examId/validation', '/:examId/publish', '/:examId/sections/reorder', '/:examId/sections/:sectionId/parts/:partId/questions/reorder']) {
    assert.ok(routes.includes(path), `${path} must exist`);
    assert.ok(routes.indexOf(path) < detail, `${path} must precede /:examId`);
  }
});

test('exam permissions remain available in the permission catalog', () => {
  const { ALL_PERMISSIONS } = require('../src/modules/auth/permissions');
  assert.ok(ALL_PERMISSIONS.includes('exams.view'));
  assert.ok(ALL_PERMISSIONS.includes('exams.manage'));
});
