const assert = require('node:assert/strict');
const db = require('../src/config/db');
const questions = require('../src/modules/question-bank-v3/questionService');
const subQuestions = require('../src/modules/question-bank-v3/subQuestionService');
const exams = require('../src/modules/exams/examService');

async function expectCode(action, code) {
  await assert.rejects(action, error => error?.code === code, `Expected error code ${code}`);
}

async function main() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const prefix = `CRUD E2E ${stamp}`;
  const groupResult = await db.query('SELECT id FROM question_groups ORDER BY created_at NULLS LAST,title LIMIT 1');
  const groupId = groupResult.rows[0]?.id;
  assert.ok(groupId, 'Cần ít nhất một nhóm câu hỏi.');

  let question = await questions.create({ questionName: `${prefix} - original`, groupId, questionType: 'MCQ_SINGLE', status: 'DRAFT' });
  question = await questions.update(question.id, { questionName: `${prefix} - updated`, note: 'Đã sửa', status: 'ACTIVE' });
  assert.equal(question.questionName, `${prefix} - updated`);
  assert.equal(question.note, 'Đã sửa');
  assert.equal(question.status, 'ACTIVE');

  const sub1Id = await subQuestions.create(question.id, {
    promptHtml: '<p>Câu con 1</p>', hint: '<p>Hint cũ</p>', explanation: '<p>Giải thích</p>', note: '<p>Ghi chú</p>', tags: ['CRUD'],
    options: [{ optionKey: 'A', optionText: 'Đúng', isCorrect: true }, { optionKey: 'B', optionText: 'Sai', isCorrect: false }],
  });
  const sub2Id = await subQuestions.create(question.id, {
    promptHtml: '<p>Câu con 2</p>', tags: ['CRUD', 'ORDER'],
    options: [{ optionKey: 'A', optionText: 'Sai', isCorrect: false }, { optionKey: 'B', optionText: 'Đúng', isCorrect: true }],
  });
  let children = await subQuestions.reorder(question.id, [sub2Id, sub1Id]);
  assert.deepEqual(children.map(item => item.id), [sub2Id, sub1Id]);
  const updatedChild = await subQuestions.update(question.id, sub1Id, {
    promptHtml: '<p>Câu con 1 đã sửa</p>', hint: '<p>Hint mới</p>', explanation: '<p>Giải thích mới</p>', note: '<p>Ghi chú mới</p>', tags: ['CRUD', 'UPDATED'],
    options: [{ optionKey: 'A', optionText: 'Đúng mới', isCorrect: true }, { optionKey: 'B', optionText: 'Sai mới', isCorrect: false }],
  });
  assert.match(updatedChild.promptHtml, /đã sửa/);
  assert.deepEqual(updatedChild.tags.map(tag => tag.name).sort(), ['CRUD', 'UPDATED']);
  const updatedTag = await db.query("SELECT id FROM question_bank_tags WHERE name='UPDATED'");
  const taggedList = await questions.list({ tagId: updatedTag.rows[0].id, search: prefix, status: 'ACTIVE' });
  assert.equal(taggedList.data.length, 1);
  assert.equal(taggedList.data[0].id, question.id);
  await expectCode(() => subQuestions.reorder(question.id, [sub1Id]), 'SUB_QUESTION_ORDER_INVALID');

  let exam = await exams.create({ title: `${prefix} - exam`, status: 'DRAFT', durationSeconds: 1800, introduction: '<p>Hướng dẫn làm bài kiểm thử.</p>' });
  exam = await exams.update(exam.id, { title: `${prefix} - exam updated`, status: 'DRAFT', durationSeconds: 2700, introduction: '<p>Hướng dẫn làm bài kiểm thử đã cập nhật.</p>' });
  assert.equal(exam.durationSeconds, 2700);
  exam = await exams.addPart(exam.id, { title: 'Phần sẽ sửa', instruction: '<p>Hướng dẫn phần thi.</p>' });
  exam = await exams.addPart(exam.id, { title: 'Phần sẽ xóa', instruction: '<p>Hướng dẫn phần thi cần xóa.</p>' });
  const firstPartId = exam.parts[0].id;
  const removablePartId = exam.parts[1].id;
  exam = await exams.reorderParts(exam.id, [removablePartId, firstPartId]);
  assert.deepEqual(exam.parts.map(part => part.id), [removablePartId, firstPartId]);
  exam = await exams.reorderParts(exam.id, [firstPartId, removablePartId]);
  exam = await exams.updatePart(exam.id, firstPartId, { title: 'Phần đã sửa', instruction: '<p>Hướng dẫn phần thi đã sửa.</p>' });
  assert.equal(exam.parts[0].title, 'Phần đã sửa');
  exam = await exams.removePart(exam.id, removablePartId);
  assert.equal(exam.parts.length, 1);

  const availableBeforeAdd = await exams.listAvailableQuestions(exam.id, { search: prefix, status: 'ACTIVE' });
  assert.ok(availableBeforeAdd.data.some(item => item.id === question.id));
  const incomplete = await exams.validation(exam.id);
  assert.equal(incomplete.valid, false);
  exam = await exams.addQuestions(exam.id, firstPartId, [question.id]);
  assert.equal(exam.parentQuestionCount, 1);
  assert.equal(exam.subQuestionCount, 2);
  const availableAfterAdd = await exams.listAvailableQuestions(exam.id, { search: prefix, status: 'ACTIVE' });
  assert.ok(!availableAfterAdd.data.some(item => item.id === question.id));
  const ready = await exams.validation(exam.id);
  assert.equal(ready.valid, true);
  await expectCode(() => questions.remove(question.id), 'ACTIVE_QUESTION_DELETE_FORBIDDEN');
  exam = await exams.removeQuestion(exam.id, firstPartId, question.id);
  assert.equal(exam.parentQuestionCount, 0);
  exam = await exams.addQuestions(exam.id, firstPartId, [question.id]);
  await expectCode(() => exams.addQuestions(exam.id, firstPartId, [question.id]), 'QUESTION_ALREADY_ADDED');
  const copy = await exams.duplicate(exam.id);
  assert.equal(copy.status, 'DRAFT');
  assert.equal(copy.parentQuestionCount, 1);
  await exams.remove(copy.id);
  await expectCode(() => questions.remove(question.id), 'ACTIVE_QUESTION_DELETE_FORBIDDEN');
  question = await questions.update(question.id, { status: 'INACTIVE' });
  await expectCode(() => questions.remove(question.id), 'QUESTION_IN_USE');
  question = await questions.update(question.id, { status: 'ACTIVE' });

  exam = await exams.activate(exam.id);
  assert.equal(exam.status, 'ACTIVE');
  for (const operation of [
    () => exams.update(exam.id, { title: 'Không được sửa', status: 'ACTIVE', durationSeconds: 60, introduction: '<p>Không được sửa</p>' }),
    () => exams.addPart(exam.id, { title: 'Không được thêm', instruction: '<p>Không được thêm</p>' }),
    () => exams.updatePart(exam.id, firstPartId, { title: 'Không được sửa', instruction: '<p>Không được sửa</p>' }),
    () => exams.removePart(exam.id, firstPartId),
    () => exams.removeQuestion(exam.id, firstPartId, question.id),
  ]) await expectCode(operation, 'ACTIVE_EXAM_LOCKED');
  await expectCode(() => exams.remove(exam.id), 'ACTIVE_EXAM_DELETE_FORBIDDEN');

  exam = await exams.deactivate(exam.id);
  assert.equal(exam.status, 'INACTIVE');
  await exams.remove(exam.id);
  await expectCode(() => exams.get(exam.id), 'EXAM_NOT_FOUND');

  await subQuestions.remove(question.id, sub2Id);
  children = await subQuestions.list(question.id);
  assert.equal(children.length, 1);
  await expectCode(() => subQuestions.remove(question.id, sub2Id), 'SUB_QUESTION_NOT_FOUND');
  question = await questions.update(question.id, { status: 'INACTIVE' });
  await questions.remove(question.id);
  await expectCode(() => questions.get(question.id), 'QUESTION_NOT_FOUND');

  console.log(JSON.stringify({
    ok: true,
    prefix,
    checks: [
      'question-create-update-delete', 'sub-question-create-update-reorder-delete', 'tag-filter', 'invalid-sub-question-reorder',
      'exam-create-update-delete', 'part-create-update-delete-reorder', 'question-picker-search-and-exclusion',
      'validation-before-and-after-question', 'question-add-remove-readd', 'duplicate-question', 'duplicate-exam',
      'question-in-use-delete-guard', 'active-exam-mutation-locks', 'active-exam-delete-guard', 'deactivate-delete',
    ],
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.close());
