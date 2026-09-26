const assert = require('node:assert/strict');
const db = require('../src/config/db');
const questions = require('../src/modules/question-bank-v3/questionService');
const subQuestions = require('../src/modules/question-bank-v3/subQuestionService');
const exams = require('../src/modules/exams/examService');

async function expectCode(action, code) {
  await assert.rejects(action, error => error?.code === code);
}

async function main() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const prefix = `E2E FULL ${stamp}`;
  const group = await db.query('SELECT id,title FROM question_groups ORDER BY created_at NULLS LAST,title LIMIT 1');
  assert.ok(group.rows[0], 'Cần ít nhất một nhóm câu hỏi để chạy E2E.');
  const groupId = group.rows[0].id;

  const mcq = await questions.create({ questionName: `${prefix} - MCQ`, groupId, questionType: 'MCQ_SINGLE', status: 'DRAFT', note: 'Dữ liệu kiểm thử toàn luồng.' });
  await subQuestions.create(mcq.id, { promptHtml: '<p>2 + 2 bằng bao nhiêu?</p>', hint: '<p>Thực hiện phép cộng.</p>', explanation: '<p>2 + 2 = 4.</p>', note: '<p>E2E MCQ 1</p>', tags: ['E2E', 'MCQ'], options: [{ optionKey: 'A', optionText: '4', isCorrect: true }, { optionKey: 'B', optionText: '5', isCorrect: false }] });
  await subQuestions.create(mcq.id, { promptHtml: '<p>Thủ đô của Việt Nam là gì?</p>', explanation: '<p>Hà Nội là thủ đô Việt Nam.</p>', tags: ['E2E', 'MCQ'], options: [{ optionKey: 'A', optionText: 'Hà Nội', isCorrect: true }, { optionKey: 'B', optionText: 'Đà Nẵng', isCorrect: false }] });
  await questions.update(mcq.id, { status: 'ACTIVE' });

  const record = await questions.create({ questionName: `${prefix} - RECORD`, groupId, questionType: 'RECORD', status: 'DRAFT', note: 'Dữ liệu kiểm thử toàn luồng.' });
  await subQuestions.create(record.id, { promptHtml: '<p>Describe your daily routine.</p>', instructionHtml: '<p>Speak clearly and use complete sentences.</p>', sentenceStartersHtml: '<p>I usually start my day by...</p>', preparationDurationSeconds: 30, recordingDurationSeconds: 60, hint: '<p>Mention morning, afternoon and evening.</p>', note: '<p>E2E Record</p>', tags: ['E2E', 'Speaking'], sampleAnswers: [{ answerHtml: '<p>I usually wake up at seven and prepare for work.</p>' }] });
  await questions.update(record.id, { status: 'ACTIVE' });

  const writing = await questions.create({ questionName: `${prefix} - WRITING`, groupId, questionType: 'WRITING', status: 'DRAFT', note: 'Dữ liệu kiểm thử toàn luồng.' });
  await subQuestions.create(writing.id, { promptHtml: '<p>Write about the benefits of learning online.</p>', instructionHtml: '<p>Write one coherent paragraph.</p>', sentenceStartersHtml: '<p>Online learning offers several benefits...</p>', maxCharacterCount: 2500, minWordCount: 80, maxWordCount: 180, hint: '<p>Consider flexibility and accessibility.</p>', note: '<p>E2E Writing</p>', tags: ['E2E', 'Writing'], sampleAnswers: [{ answerHtml: '<p>Online learning is flexible and gives learners access to many useful resources.</p>' }] });
  await questions.update(writing.id, { status: 'ACTIVE' });

  let exam = await exams.create({ title: `${prefix} - EXAM`, status: 'DRAFT', durationSeconds: 3600, introduction: '<p>Đọc kỹ hướng dẫn của từng phần trước khi bắt đầu làm bài.</p>' });
  exam = await exams.addPart(exam.id, { title: 'Phần trắc nghiệm', durationMinutes: 20, instruction: '<p>Chọn một đáp án đúng cho mỗi câu hỏi.</p>' });
  exam = await exams.addPart(exam.id, { title: 'Phần thực hành', durationMinutes: 40, instruction: '<p>Hoàn thành lần lượt phần nói và phần viết.</p>' });
  await exams.addQuestions(exam.id, exam.parts[0].id, [mcq.id]);
  exam = await exams.addQuestions(exam.id, exam.parts[1].id, [record.id, writing.id]);

  const validation = await exams.validation(exam.id);
  assert.equal(validation.valid, true, validation.errors.join('; '));
  assert.deepEqual(validation.summary, { partCount: 2, parentQuestionCount: 3, subQuestionCount: 4, totalPoints: 40 });

  exam = await exams.activate(exam.id);
  assert.equal(exam.status, 'ACTIVE');
  assert.equal(exam.activeVersion, 1);
  await expectCode(
    () => exams.update(exam.id, { title: `${prefix} - LOCKED`, durationSeconds: 1800, status: 'ACTIVE' }),
    'ACTIVE_EXAM_LOCKED',
  );
  await expectCode(() => exams.addPart(exam.id, { title: 'Không được thêm', durationMinutes: 10, instruction: '<p>Phần kiểm tra khóa.</p>' }), 'ACTIVE_EXAM_LOCKED');
  const version = await db.query('SELECT version_number,total_parent_questions,total_sub_questions,total_points,snapshot FROM exam_versions WHERE id=$1', [exam.activeVersionId]);
  assert.equal(version.rows[0].version_number, 1);
  assert.equal(version.rows[0].total_parent_questions, 3);
  assert.equal(version.rows[0].total_sub_questions, 4);
  assert.equal(Number(version.rows[0].total_points), 40);
  assert.equal(version.rows[0].snapshot.parts.length, 2);
  assert.equal(version.rows[0].snapshot.exam.title, `${prefix} - EXAM`);

  exam = await exams.deactivate(exam.id);
  assert.equal(exam.status, 'INACTIVE');
  await expectCode(() => exams.addQuestions(exam.id, exam.parts[1].id, [writing.id]), 'QUESTION_ALREADY_ADDED');
  await expectCode(() => exams.reorderParts(exam.id, [exam.parts[0].id]), 'INVALID_REORDER');

  const revisedTitle = `${prefix} - EXAM V2`;
  exam = await exams.update(exam.id, { title: revisedTitle, durationSeconds: 5400, status: 'INACTIVE' });
  exam = await exams.updatePart(exam.id, exam.parts[1].id, { title: 'Phần nói và viết', durationMinutes: 40, instruction: '<p>Hoàn thành lần lượt phần nói và phần viết.</p>' });
  exam = await exams.reorderParts(exam.id, [...exam.parts].reverse().map(part => part.id));
  const validationV2 = await exams.validation(exam.id);
  assert.equal(validationV2.valid, true, validationV2.errors.join('; '));
  exam = await exams.activate(exam.id);
  assert.equal(exam.status, 'ACTIVE');
  assert.equal(exam.activeVersion, 2);
  assert.equal(exam.title, revisedTitle);
  assert.equal(exam.durationSeconds, 5400);

  const versions = await db.query('SELECT version_number,snapshot FROM exam_versions WHERE exam_id=$1 ORDER BY version_number', [exam.id]);
  assert.equal(versions.rows.length, 2);
  assert.equal(versions.rows[0].snapshot.exam.title, `${prefix} - EXAM`);
  assert.equal(versions.rows[0].snapshot.parts[1].title, 'Phần thực hành');
  assert.equal(versions.rows[1].snapshot.exam.title, revisedTitle);
  assert.equal(versions.rows[1].snapshot.exam.durationSeconds, 5400);
  assert.equal(versions.rows[1].snapshot.parts[0].title, 'Phần nói và viết');

  const reloaded = await exams.get(exam.id);
  assert.equal(reloaded.status, 'ACTIVE');
  assert.equal(reloaded.partCount, 2);
  assert.equal(reloaded.parentQuestionCount, 3);
  assert.equal(reloaded.subQuestionCount, 4);
  assert.equal(reloaded.totalPoints, 40);

  console.log(JSON.stringify({
    ok: true,
    prefix,
    group: group.rows[0].title,
    questions: { mcq: mcq.id, record: record.id, writing: writing.id },
    exam: { id: exam.id, title: exam.title, status: exam.status, durationMinutes: exam.durationSeconds / 60, activeVersion: exam.activeVersion },
    summary: validation.summary,
    checks: ['active-lock', 'duplicate-question', 'invalid-reorder', 'deactivate-edit-reactivate', 'immutable-v1-snapshot', 'reload-summary'],
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.close());
