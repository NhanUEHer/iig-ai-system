const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const HttpError = require('../src/http/httpError');
const validator = require('../src/modules/question-bank-v3/questionValidator');
const repository = require('../src/modules/question-bank-v3/questionRepository');
const service = require('../src/modules/question-bank-v3/questionService');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
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

test('question bank V3 repository maps code and the active API response shape', () => {
  const question = repository.map({
    id: '22222222-2222-4222-8222-222222222222', code: 'QB-000042', question_name: 'MCQ 01', group_id: groupId,
    group_title: 'Listening', question_type: 'MCQ_SINGLE', note: 'Note', status: 'ACTIVE',
    created_at: new Date('2026-01-01T00:00:00Z'), updated_at: new Date('2026-01-02T00:00:00Z'),
  });
  assert.equal(question.code, 'QB-000042');
  assert.equal(question.questionName, 'MCQ 01');
  assert.equal(question.groupId, groupId);
  assert.equal(question.groupName, 'Listening');
  assert.equal(question.questionType, 'MCQ_SINGLE');
});

test('creating a question always persists DRAFT and forwards no client-provided code', async () => {
  const calls = [];
  const originalCreate = repository.create;
  const db = require('../src/config/db');
  const originalQuery = db.query;
  db.query = async () => ({ rows: [{ id: groupId, status: 'ACTIVE' }] });
  repository.create = async (data, userId) => { calls.push({ data, userId }); return { id: 'new', ...data, status: 'DRAFT' }; };
  try {
    await service.create({ questionName: 'New', groupId, questionType: 'MCQ_SINGLE', status: 'ACTIVE', code: 'HACK-1' }, 'user-1');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].data.code, undefined, 'client code must not reach the repository');
    assert.equal(calls[0].data.questionName, 'New');
    assert.equal(calls[0].data.questionType, 'MCQ_SINGLE');
  } finally {
    repository.create = originalCreate;
    db.query = originalQuery;
  }
});

test('question type is immutable once created', async () => {
  const originalFindById = repository.findById;
  repository.findById = async () => ({ id: 'q-1', code: 'QB-1', groupId, questionType: 'MCQ_SINGLE', status: 'DRAFT' });
  try {
    await assert.rejects(
      () => service.update('q-1', { questionType: 'WRITING' }, 'user-1'),
      error => error instanceof HttpError && error.code === 'QUESTION_TYPE_IMMUTABLE',
    );
  } finally {
    repository.findById = originalFindById;
  }
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

test('question list repository only accepts the plural filter contract without tags', () => {
  const source = read('src/modules/question-bank-v3/questionRepository.js');
  assert.match(source, /function buildWhere\(\{ search, groupIds, questionTypes, statuses \}/);
  assert.doesNotMatch(source, /tagId|tagIds|question_bank_sub_question_tags/);
  assert.doesNotMatch(source, /listValues\(groupId\)|listValues\(status\)|listValues\(questionType\)/);
});

test('question list filters reject malformed UUIDs and unsupported enum values before querying PostgreSQL', () => {
  assert.throws(() => service.validateFilters({ groupIds: ['not-a-uuid'] }), error => error.code === 'GROUP_IDS_INVALID');
  assert.throws(() => service.validateFilters({ questionTypes: ['UNKNOWN'] }), error => error.code === 'QUESTION_TYPES_INVALID');
  assert.throws(() => service.validateFilters({ statuses: ['DELETED'] }), error => error.code === 'STATUSES_INVALID');
  assert.doesNotThrow(() => service.validateFilters({ groupIds: [groupId], questionTypes: ['MCQ_SINGLE'], statuses: ['DRAFT'] }));
});

test('question code is generated from the backend sequence inside the create transaction', () => {
  const source = read('src/modules/question-bank-v3/questionRepository.js');
  assert.match(source, /question_code_seq/);
  assert.match(source, /db\.transaction\(async client =>/);
  assert.match(source, /INSERT INTO question_bank_questions\(code,/);
});

test('activation requires both a content and a ready sub-question set', () => {
  const source = read('src/modules/question-bank-v3/questionService.js');
  assert.match(source, /QUESTION_CONTENT_REQUIRED/);
  assert.match(source, /QUESTION_NOT_READY/);
  assert.match(source, /QUESTION_GROUP_NOT_ACTIVE/);
  assert.match(source, /contents\.list/);
  assert.match(source, /subQuestions\.list/);
});

test('content and sub-question tabs are saved through a single transaction each', () => {
  const contentRepo = read('src/modules/question-bank-v3/contentRepository.js');
  const subRepo = read('src/modules/question-bank-v3/subQuestionRepository.js');
  assert.match(contentRepo, /async function saveAll\(questionId, items\)/);
  assert.match(contentRepo, /db\.transaction\(async client =>/);
  assert.match(subRepo, /async function saveAll\(questionId, items\)/);
  assert.match(subRepo, /db\.transaction\(async client =>/);
});

test('bulk-save rejects items that belong to a different question', () => {
  const contentService = read('src/modules/question-bank-v3/contentService.js');
  const subService = read('src/modules/question-bank-v3/subQuestionService.js');
  assert.match(contentService, /CONTENT_NOT_IN_QUESTION/);
  assert.match(subService, /SUB_QUESTION_NOT_IN_QUESTION/);
});

test('sort_order is normalised contiguously in repositories and migration', () => {
  const contentRepo = read('src/modules/question-bank-v3/contentRepository.js');
  const subRepo = read('src/modules/question-bank-v3/subQuestionRepository.js');
  const migration = read('src/database/migrations/104_question_bank_management_redesign.sql');
  assert.match(contentRepo, /ROW_NUMBER\(\) OVER\(ORDER BY sort_order,id\)-1/);
  assert.match(subRepo, /ROW_NUMBER\(\) OVER\(ORDER BY sort_order,id\)-1/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS sort_order INTEGER/);
});

test('content and sub-question edits are locked while the question is ACTIVE', () => {
  const contentService = read('src/modules/question-bank-v3/contentService.js');
  const subService = read('src/modules/question-bank-v3/subQuestionService.js');
  assert.match(contentService, /ACTIVE_QUESTION_LOCKED/);
  assert.match(subService, /ACTIVE_QUESTION_LOCKED/);
});

test('content media links resolve through direct ID columns, not question_bank_media joins', () => {
  const migration = read('src/database/migrations/104_question_bank_management_redesign.sql');
  const mediaService = read('src/modules/question-bank-v3/mediaService.js');
  assert.match(migration, /ADD COLUMN IF NOT EXISTS audio_media_id UUID/);
  assert.match(migration, /image_media_id UUID/);
  assert.match(migration, /video_media_id UUID/);
  assert.match(mediaService, /UPDATE question_bank_contents SET \$\{CONTENT_COLUMN\[type\]\}/);
  assert.match(mediaService, /UPDATE question_bank_sub_questions SET audio_media_id/);
  assert.match(mediaService, /FOR UPDATE OF c/);
  assert.match(mediaService, /FOR UPDATE OF s/);
  assert.match(mediaService, /cleanupStorageKey\(committed\.oldStorageKey\)/);
});

test('content and sub-question deletion collect storage keys inside the transaction for post-commit cleanup', () => {
  const contentRepo = read('src/modules/question-bank-v3/contentRepository.js');
  const contentService = read('src/modules/question-bank-v3/contentService.js');
  const subRepo = read('src/modules/question-bank-v3/subQuestionRepository.js');
  const subService = read('src/modules/question-bank-v3/subQuestionService.js');
  assert.match(contentRepo, /deletedStorageKeys/);
  assert.match(subRepo, /deletedStorageKeys/);
  assert.match(contentService, /await cleanup\(result\.deletedStorageKeys\)/);
  assert.match(subService, /await cleanup\(result\.deletedStorageKeys\)/);
});

test('exam snapshot reads canonical question-bank columns and preserves its delivery contract aliases', () => {
  // The snapshot builder now lives in the exam repository (Exam Management
  // redesign), but it must keep the same delivery aliases so public candidate
  // delivery and grading continue to read the expected fields.
  const source = read('src/modules/exams/examRepository.js');
  assert.match(source, /prompt_text AS prompt_html/);
  assert.match(source, /hint_html AS hint/);
  assert.match(source, /explanation_html AS explanation/);
  assert.match(source, /sort_order AS display_order/);
});

test('question bank V3 routes expose the plural contract, bulk-save and scoped media endpoints', () => {
  const layers = require('../src/routes/questionBankV3Routes').stack.map(layer => layer.route).filter(Boolean);
  const paths = layers.map(route => route.path);
  const has = (method, p) => layers.some(route => route.path === p && route.methods[method]);
  for (const p of ['/question-groups', '/questions/filter-options', '/questions', '/questions/:id', '/questions/:questionId/contents', '/questions/:questionId/sub-questions', '/media/:mediaId/url']) {
    assert.ok(paths.includes(p), `${p} must exist`);
  }
  assert.ok(has('put', '/questions/:questionId/contents'), 'content bulk-save PUT must exist');
  assert.ok(has('put', '/questions/:questionId/sub-questions'), 'sub-question bulk-save PUT must exist');
  assert.ok(has('post', '/contents/:contentId/media/:mediaType'), 'scoped content media upload must exist');
  assert.ok(has('post', '/sub-questions/:subQuestionId/audio'), 'sub-question audio upload must exist');
  assert.ok(paths.indexOf('/questions/filter-options') < paths.indexOf('/questions/:id'));
  assert.ok(!paths.includes('/tags'), 'tag routes must be removed from the new contract');
});

test('question bank V3 endpoints keep the documented permissions', () => {
  const routes = read('src/routes/questionBankV3Routes.js');
  assert.match(routes, /router\.get\('\/questions',\s*requirePermission\('question_bank\.view'\)/);
  assert.match(routes, /router\.post\('\/questions',\s*requirePermission\('question_bank\.manage'\)/);
  assert.match(routes, /router\.put\('\/questions\/:questionId\/contents',\s*requirePermission\('question_bank\.manage'\)/);
  assert.match(routes, /router\.put\('\/questions\/:questionId\/sub-questions',\s*requirePermission\('question_bank\.manage'\)/);
  assert.match(routes, /media\/:mediaType',\s*requirePermission\('question_bank\.media_manage'\)/);
  assert.match(routes, /audio',\s*requirePermission\('question_bank\.media_manage'\)/);
});

test('question bank permissions remain available in the permission catalog', () => {
  const { ALL_PERMISSIONS } = require('../src/modules/auth/permissions');
  for (const permission of ['question_bank.view', 'question_bank.manage', 'question_bank.media_manage', 'question_bank.taxonomy_manage']) {
    assert.ok(ALL_PERMISSIONS.includes(permission), `${permission} must exist`);
  }
});

test('question management frontend uses the new isolated module and the V3 bulk-save contract', () => {
  const app = read('frontend/src/App.jsx');
  const listPage = read('frontend/src/features/question-management/QuestionListPage.jsx');
  const editPage = read('frontend/src/features/question-management/QuestionEditPage.jsx');
  const createPage = read('frontend/src/features/question-management/QuestionCreatePage.jsx');
  const serviceSource = read('frontend/src/services/questionBankService.js');
  assert.match(app, /features\/question-management\/QuestionListPage/);
  assert.match(app, /features\/question-management\/QuestionCreatePage/);
  assert.match(app, /features\/question-management\/QuestionEditPage/);
  assert.doesNotMatch(listPage, /tagIds|listQuestionTags|bulkActions/);
  assert.match(listPage, /selectable selectedRowKeys=\{selected\}/);
  assert.match(listPage, /key: 'stt'/);
  assert.match(editPage, /saveQuestionContents/);
  assert.match(editPage, /saveSubQuestions/);
  assert.match(createPage, /MultiSelectFilter single className="qm-single-select qm-group-select" value=\{form\.groupId\}/);
  assert.match(createPage, /MultiSelectFilter single className="qm-single-select qm-type-select" value=\{form\.questionType\}/);
  assert.match(editPage, /MultiSelectFilter single className="qm-single-select qm-group-select" value=\{question\.groupId/);
  assert.match(serviceSource, /questions\/\$\{questionId\}\/contents`, \{ items \}/);
  assert.match(serviceSource, /questions\/\$\{questionId\}\/sub-questions`, \{ items \}/);
});
