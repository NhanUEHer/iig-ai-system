const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateQuestionInput } = require('../src/modules/question-bank-v3/questionValidator');
const { validate } = require('../src/modules/question-bank-v3/subQuestionService');
const { validate: validateMedia, hasSignature } = require('../src/modules/question-bank-v3/mediaService');

const mainQuestion = questionType => ({
  questionName: `Test ${questionType}`,
  groupId: '00000000-0000-4000-8000-000000000001',
  questionType,
  status: 'DRAFT',
});

test('Question Bank V3 accepts MCQ, Record and Writing main question types', () => {
  for (const type of ['MCQ_SINGLE', 'RECORD', 'WRITING']) {
    assert.doesNotThrow(() => validateQuestionInput(mainQuestion(type)));
  }
  assert.throws(() => validateQuestionInput(mainQuestion('UNKNOWN')), error => error.code === 'QUESTION_TYPE_INVALID');
});

test('MCQ requires at least two options and exactly one correct answer', () => {
  assert.doesNotThrow(() => validate({
    promptHtml: '<p>Choose one</p>',
    options: [
      { optionText: 'A', isCorrect: true },
      { optionText: 'B', isCorrect: false },
    ],
  }, 'MCQ_SINGLE'));
  assert.throws(() => validate({ promptHtml: 'Question', options: [] }, 'MCQ_SINGLE'), error => error.code === 'OPTIONS_MINIMUM');
});

test('Dạng 3 rejects a missing or whitespace-only question prompt', () => {
  for (const promptHtml of [undefined, null, '', '   ']) {
    assert.throws(
      () => validate({ promptHtml, options: [{ optionText: 'A', isCorrect: true }, { optionText: 'B', isCorrect: false }] }, 'MCQ_SINGLE'),
      error => error.code === 'PROMPT_REQUIRED',
    );
  }
});

test('Dạng 3 rejects missing options and a single option', () => {
  for (const options of [undefined, null, [], [{ optionText: 'A', isCorrect: true }]]) {
    assert.throws(
      () => validate({ promptHtml: '<p>Question</p>', options }, 'MCQ_SINGLE'),
      error => error.code === 'OPTIONS_MINIMUM',
    );
  }
});

test('Dạng 3 rejects empty option content', () => {
  for (const emptyText of [undefined, null, '', '   ']) {
    assert.throws(
      () => validate({
        promptHtml: '<p>Question</p>',
        options: [{ optionText: 'A', isCorrect: true }, { optionText: emptyText, isCorrect: false }],
      }, 'MCQ_SINGLE'),
      error => error.code === 'OPTION_TEXT_REQUIRED',
    );
  }
});

test('Dạng 3 requires exactly one correct option', () => {
  const options = [
    { optionText: 'A', isCorrect: false },
    { optionText: 'B', isCorrect: false },
    { optionText: 'C', isCorrect: false },
  ];
  assert.throws(
    () => validate({ promptHtml: '<p>Question</p>', options }, 'MCQ_SINGLE'),
    error => error.code === 'CORRECT_OPTION_REQUIRED',
  );
  assert.throws(
    () => validate({ promptHtml: '<p>Question</p>', options: options.map((option, index) => ({ ...option, isCorrect: index < 2 })) }, 'MCQ_SINGLE'),
    error => error.code === 'CORRECT_OPTION_REQUIRED',
  );
});

test('Dạng 3 accepts 2, 3 and 4 non-empty options with one correct answer', () => {
  for (const optionCount of [2, 3, 4]) {
    const options = Array.from({ length: optionCount }, (_, index) => ({
      optionKey: String.fromCharCode(65 + index),
      optionText: `Đáp án ${index + 1}`,
      isCorrect: index === optionCount - 1,
    }));
    assert.doesNotThrow(() => validate({ promptHtml: '<p>Nội dung câu hỏi</p>', options }, 'MCQ_SINGLE'));
  }
});

test('Dạng 3 UI keeps radio selection, answer add/remove and two-option minimum', () => {
  const pageSource = fs.readFileSync(path.join(__dirname, '../frontend/src/features/question-bank/pages/QuestionBankEditPage.jsx'), 'utf8');
  const editorSource = fs.readFileSync(path.join(__dirname, '../frontend/src/features/question-bank/components/McqQuestionEditor.jsx'), 'utf8');
  assert.match(pageSource, /blankOption\('A', true\).*blankOption\('B'\)/);
  assert.match(pageSource, /item\.options\.length <= 2/);
  assert.match(editorSource, /isCorrect: i === optionIndex/);
  assert.match(pageSource, /String\.fromCharCode\(65 \+ item\.options\.length\)/);
  assert.match(editorSource, /type="radio"/);
  assert.match(editorSource, /onAddOption/);
  assert.match(editorSource, /onRemoveOption/);
});

test('Record requires positive preparation and recording durations', () => {
  assert.doesNotThrow(() => validate({
    promptHtml: '<p>Speak</p>',
    preparationDurationSeconds: 60,
    recordingDurationSeconds: 120,
  }, 'RECORD'));
  assert.throws(() => validate({ promptHtml: 'Speak', preparationDurationSeconds: 0, recordingDurationSeconds: 120 }, 'RECORD'), error => error.code === 'PREPARATION_DURATION_INVALID');
  assert.throws(() => validate({ promptHtml: 'Speak', preparationDurationSeconds: 60, recordingDurationSeconds: 0 }, 'RECORD'), error => error.code === 'RECORDING_DURATION_INVALID');
  assert.doesNotThrow(() => validate({ promptHtml: 'Speak', preparationDurationSeconds: 60, recordingDurationSeconds: 120, sampleAnswers: [] }, 'RECORD'));
});

test('Record rejects missing, negative, decimal and malformed durations', () => {
  const valid = { promptHtml: '<p>Speak now</p>', preparationDurationSeconds: 60, recordingDurationSeconds: 120 };
  for (const preparationDurationSeconds of [undefined, null, '', -1, 0, 1.5, 'abc']) {
    assert.throws(
      () => validate({ ...valid, preparationDurationSeconds }, 'RECORD'),
      error => error.code === 'PREPARATION_DURATION_INVALID',
    );
  }
  for (const recordingDurationSeconds of [undefined, null, '', -1, 0, 1.5, 'abc']) {
    assert.throws(
      () => validate({ ...valid, recordingDurationSeconds }, 'RECORD'),
      error => error.code === 'RECORDING_DURATION_INVALID',
    );
  }
  assert.doesNotThrow(() => validate({ ...valid, preparationDurationSeconds: '60', recordingDurationSeconds: '120' }, 'RECORD'));
});

test('Record requires question content but does not require audio or sample answers', () => {
  const durations = { preparationDurationSeconds: 60, recordingDurationSeconds: 120 };
  for (const promptHtml of [undefined, null, '', '   ']) {
    assert.throws(() => validate({ ...durations, promptHtml }, 'RECORD'), error => error.code === 'PROMPT_REQUIRED');
  }
  assert.doesNotThrow(() => validate({ ...durations, promptHtml: '<p>Describe your daily routine.</p>' }, 'RECORD'));
});

test('Record UI matches the required Stitch fields and omits legacy fields', () => {
  const source = fs.readFileSync(path.join(__dirname, '../frontend/src/features/question-bank/components/RecordQuestionEditor.jsx'), 'utf8');
  assert.match(source, /Nội dung câu hỏi/);
  assert.match(source, /Audio câu hỏi/);
  assert.match(source, /Thời gian chuẩn bị câu hỏi/);
  assert.match(source, /Thời gian ghi âm câu hỏi/);
  assert.match(source, /Hướng dẫn làm bài/);
  assert.match(source, /Ghi chú nội bộ/);
  const recordSection = source.slice(source.indexOf('function RecordEditor'), source.indexOf('function WritingEditor'));
  assert.doesNotMatch(recordSection, /Tag|Sentence Starters|Câu trả lời mẫu/);
});

test('Record audio accepts common valid MP3 signatures and rejects renamed non-audio files', () => {
  const id3Mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(32)]);
  const mpeg1Layer3 = Buffer.from([0xff, 0xfb, 0x90, 0x64, ...Array(32).fill(0)]);
  const mpeg1Layer3Crc = Buffer.from([0xff, 0xfa, 0x90, 0x64, ...Array(32).fill(0)]);
  const paddedMp3 = Buffer.concat([Buffer.alloc(48), mpeg1Layer3Crc]);
  for (const buffer of [id3Mp3, mpeg1Layer3, mpeg1Layer3Crc, paddedMp3]) {
    assert.equal(hasSignature(buffer, 'AUDIO'), true);
    assert.equal(validateMedia({ buffer, mimetype: 'audio/mpeg', size: buffer.length, originalname: 'record.mp3' }), 'AUDIO');
  }
  const fakeMp3 = Buffer.from('<!DOCTYPE html><html><body>not audio</body></html>');
  assert.equal(hasSignature(fakeMp3, 'AUDIO'), false);
  assert.throws(
    () => validateMedia({ buffer: fakeMp3, mimetype: 'audio/mpeg', size: fakeMp3.length, originalname: 'fake.mp3' }),
    error => error.code === 'MEDIA_FILE_IS_HTML',
  );
});

test('Record audio accepts WAV and rejects unsupported MIME, oversized and missing files', () => {
  const wav = Buffer.alloc(44);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36, 4);
  wav.write('WAVE', 8, 'ascii');
  assert.equal(validateMedia({ buffer: wav, mimetype: 'audio/wav', size: wav.length, originalname: 'record.wav' }), 'AUDIO');
  assert.throws(() => validateMedia(), error => error.code === 'MEDIA_FILE_REQUIRED');
  assert.throws(
    () => validateMedia({ buffer: wav, mimetype: 'application/octet-stream', size: wav.length, originalname: 'record.wav' }),
    error => error.code === 'MEDIA_TYPE_INVALID',
  );
  assert.throws(
    () => validateMedia({ buffer: wav, mimetype: 'audio/wav', size: 101 * 1024 * 1024, originalname: 'large.wav' }),
    error => error.code === 'MEDIA_TOO_LARGE',
  );
});

test('Record preparation duration is persisted by migration, repository and exam snapshot', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../src/database/migrations/085_question_bank_v3_record_preparation.sql'), 'utf8');
  const repository = fs.readFileSync(path.join(__dirname, '../src/modules/question-bank-v3/subQuestionRepository.js'), 'utf8');
  const examService = fs.readFileSync(path.join(__dirname, '../src/modules/exams/examService.js'), 'utf8');
  assert.match(migration, /preparation_duration_seconds INTEGER/);
  assert.match(migration, /CHECK \(preparation_duration_seconds IS NULL OR preparation_duration_seconds > 0\)/);
  assert.match(repository, /preparationDurationSeconds:r\.preparation_duration_seconds/);
  assert.match(repository, /data\.preparationDurationSeconds/);
  assert.match(examService, /preparation_duration_seconds/);
});

test('Writing requires positive maximum character and minimum word limits', () => {
  assert.doesNotThrow(() => validate({
    promptHtml: '<p>Write an essay</p>',
    maxCharacterCount: 2500,
    minWordCount: 250,
  }, 'WRITING'));
  assert.throws(() => validate({ promptHtml: 'Write', maxCharacterCount: 0, minWordCount: 250 }, 'WRITING'), error => error.code === 'MAX_CHARACTER_COUNT_INVALID');
  assert.throws(() => validate({ promptHtml: 'Write', maxCharacterCount: 2500, minWordCount: 0 }, 'WRITING'), error => error.code === 'MIN_WORD_COUNT_INVALID');
  assert.doesNotThrow(() => validate({ promptHtml: 'Write', maxCharacterCount: 2500, minWordCount: 250, sampleAnswers: [] }, 'WRITING'));
});

test('Writing UI matches Stitch fields and omits legacy sample-answer fields', () => {
  const source = fs.readFileSync(path.join(__dirname, '../frontend/src/features/question-bank/components/RecordQuestionEditor.jsx'), 'utf8');
  const writingSection = source.slice(source.indexOf('function WritingEditor'), source.indexOf('export default function'));
  for (const label of ['Nội dung câu hỏi', 'Audio câu hỏi', 'Số ký tự tối đa', 'Số từ tối thiểu', 'Hướng dẫn làm bài', 'Ghi chú nội bộ']) assert.match(writingSection, new RegExp(label));
  assert.doesNotMatch(writingSection, /Câu trả lời mẫu|Sentence Starters|Tag/);
  assert.match(writingSection, /maxCharacterCount/);
  assert.match(writingSection, /minWordCount/);
});

test('Writing limits are persisted by migration, repository and exam snapshot', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../src/database/migrations/086_question_bank_v3_writing_limits.sql'), 'utf8');
  const repository = fs.readFileSync(path.join(__dirname, '../src/modules/question-bank-v3/subQuestionRepository.js'), 'utf8');
  const examService = fs.readFileSync(path.join(__dirname, '../src/modules/exams/examService.js'), 'utf8');
  assert.match(migration, /max_character_count INTEGER/);
  assert.match(migration, /min_word_count INTEGER/);
  assert.match(repository, /maxCharacterCount:r\.max_character_count/);
  assert.match(repository, /minWordCount:r\.min_word_count/);
  assert.match(examService, /max_character_count,min_word_count/);
});

test('question deletion reports a business conflict when an exam uses it', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/question-bank-v3/questionService.js'), 'utf8');
  assert.match(source, /ACTIVE_QUESTION_DELETE_FORBIDDEN/);
  assert.match(source, /exam_part_questions WHERE question_id=\$1/);
  assert.match(source, /QUESTION_IN_USE/);
});

test('question list exposes only implemented row actions and real bulk deletion', () => {
  const source = fs.readFileSync(path.join(__dirname, '../frontend/src/features/question-bank/pages/QuestionBankListPage.jsx'), 'utf8');
  assert.doesNotMatch(source, /Sao chép|Tải xuống|sẽ được bổ sung sau/);
  assert.doesNotMatch(source, /label: 'Xem'/);
  assert.match(source, /row\.status !== 'ACTIVE'/);
  assert.match(source, /Promise\.allSettled\(ids\.map\(deleteQuestion\)\)/);
  assert.match(source, /listQuestionTags/);
  assert.match(source, /updateFilter\('tagIds', value\)/);
  assert.match(source, /updateFilter\('questionTypes', value\)/);
  assert.doesNotMatch(source, /Tất cả nhóm/);
  assert.doesNotMatch(source, /label: 'Phiên bản'/);
  assert.match(source, /updateFilter\('statuses', value\)/);
});
