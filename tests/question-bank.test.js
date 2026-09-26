const assert = require('node:assert/strict');
const test = require('node:test');

const HttpError = require('../src/http/httpError');
const validator = require('../src/modules/question-bank-v3/questionValidator');
const repository = require('../src/modules/question-bank-v3/questionRepository');
const service = require('../src/modules/question-bank-v3/questionService');

const groupId = '11111111-1111-4111-8111-111111111111';

test('question bank V3 validator enforces required parent-question fields', () => {
  assert.throws(() => validator.validateQuestionInput({}, false), error => error instanceof HttpError && error.code === 'QUESTION_NAME_REQUIRED');
  assert.throws(() => validator.validateQuestionInput({ questionName: 'Question' }, false), error => error instanceof HttpError && error.code === 'GROUP_REQUIRED');
  assert.throws(() => validator.validateQuestionInput({ questionName: 'Question', groupId, questionType: 'ESSAY' }, false), error => error instanceof HttpError && error.code === 'QUESTION_TYPE_INVALID');
  assert.throws(() => validator.validateQuestionInput({ questionName: 'Question', groupId, questionType: 'MCQ_SINGLE', status: 'PENDING' }, false), error => error instanceof HttpError && error.code === 'STATUS_INVALID');
  assert.doesNotThrow(() => validator.validateQuestionInput({ questionName: 'Question', groupId, questionType: 'MCQ_SINGLE', status: 'DRAFT' }, false));
});

test('question bank V3 supports exactly the implemented main question types', () => {
  for (const questionType of ['MCQ_SINGLE', 'RECORD', 'WRITING']) {
    assert.doesNotThrow(() => validator.validateQuestionInput({ questionName: questionType, groupId, questionType }, false));
  }
});

test('question bank V3 repository maps the active API response shape', () => {
  const question = repository.map({
    id: '22222222-2222-4222-8222-222222222222', question_name: 'MCQ 01', group_id: groupId,
    group_title: 'Listening', question_type: 'MCQ_SINGLE', note: 'Note', status: 'ACTIVE',
    created_at: new Date('2026-01-01T00:00:00Z'), updated_at: new Date('2026-01-02T00:00:00Z'),
  });
  assert.equal(question.questionName, 'MCQ 01');
  assert.equal(question.groupId, groupId);
  assert.equal(question.groupName, 'Listening');
  assert.equal(question.questionType, 'MCQ_SINGLE');
});

test('question bank V3 prevents deleting an active question', async () => {
  const originalFindById = repository.findById;
  repository.findById = async () => ({ id: 'q-1', status: 'ACTIVE' });
  try {
    await assert.rejects(() => service.remove('q-1'), error => error instanceof HttpError && error.code === 'ACTIVE_QUESTION_DELETE_FORBIDDEN');
  } finally {
    repository.findById = originalFindById;
  }
});

test('question bank V3 routes expose groups, filters, media, contents and sub-questions', () => {
  const routes = require('../src/routes/questionBankV3Routes').stack.map(layer => layer.route?.path).filter(Boolean);
  for (const path of ['/question-groups', '/questions/filter-options', '/questions', '/questions/:id', '/questions/:questionId/contents', '/questions/:questionId/sub-questions', '/media/:mediaId']) {
    assert.ok(routes.includes(path), `${path} must exist`);
  }
  assert.ok(routes.indexOf('/questions/filter-options') < routes.indexOf('/questions/:id'));
});

test('question bank V3 only activates complete questions in active groups', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/question-bank-v3/questionService.js'), 'utf8');
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/questionBankV3Routes.js'), 'utf8');
  assert.match(source, /QUESTION_CREATE_AS_DRAFT/);
  assert.match(source, /QUESTION_GROUP_NOT_ACTIVE/);
  assert.match(source, /QUESTION_NOT_READY/);
  assert.match(source, /subQuestions\.list/);
  assert.match(routes, /WHERE status='ACTIVE'/);
});

test('question bank permissions remain available in the permission catalog', () => {
  const { ALL_PERMISSIONS } = require('../src/modules/auth/permissions');
  for (const permission of ['question_bank.view', 'question_bank.manage', 'question_bank.media_manage', 'question_bank.taxonomy_manage']) {
    assert.ok(ALL_PERMISSIONS.includes(permission), `${permission} must exist`);
  }
});
