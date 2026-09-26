const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('question group API has a separate CRUD contract while preserving legacy group lookup', () => {
  const routes = read('src/routes/questionBankV3Routes.js');
  assert.match(routes, /router\.get\('\/groups'/);
  assert.match(routes, /router\.get\('\/question-groups'/);
  assert.match(routes, /router\.get\('\/question-groups\/next-code'/);
  assert.match(routes, /router\.post\('\/question-groups'/);
  assert.match(routes, /router\.put\('\/question-groups\/:id'/);
  assert.match(routes, /router\.delete\('\/question-groups\/:id'/);
});

test('question group service validates input and prevents deletion while questions are linked', () => {
  const source = read('src/modules/question-bank-v3/questionGroupService.js');
  assert.match(source, /QUESTION_GROUP_NAME_REQUIRED/);
  assert.match(source, /QUESTION_GROUP_STATUS_INVALID/);
  assert.match(source, /group\.questionCount > 0/);
  assert.match(source, /QUESTION_GROUP_IN_USE/);
  assert.match(source, /QUESTION_GROUP_HAS_ACTIVE_QUESTIONS/);
});

test('question group management page provides listing, status filtering, and create/edit modal', () => {
  const source = read('frontend/src/features/question-bank/pages/QuestionGroupManagementPage.jsx');
  assert.match(source, /Quản lý nhóm câu hỏi/);
  assert.match(source, /Tìm kiếm theo tên nhóm/);
  assert.match(source, /Thêm nhóm câu hỏi/);
  assert.match(source, /Cập nhật nhóm câu hỏi/);
  assert.match(source, /deleteManagedQuestionGroup/);
  assert.match(source, /previewManagedQuestionGroupCode/);
});
