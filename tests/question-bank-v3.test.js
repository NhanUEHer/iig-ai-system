const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateQuestionInput } = require('../src/modules/question-bank-v3/questionValidator');
const { validate, normalizeForType } = require('../src/modules/question-bank-v3/subQuestionService');
const { validate: validateMedia, hasSignature, mediaTypeFromSlug } = require('../src/modules/question-bank-v3/mediaService');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

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

test('MCQ sub-question accepts question_text plus two options with a single correct answer', () => {
  assert.doesNotThrow(() => validate({
    questionText: '<p>Choose one</p>',
    options: [
      { optionText: 'A', isCorrect: true },
      { optionText: 'B', isCorrect: false },
    ],
  }, 'MCQ_SINGLE'));
  assert.throws(() => validate({ questionText: 'Question', options: [] }, 'MCQ_SINGLE'), error => error.code === 'OPTIONS_MINIMUM');
});

test('MCQ rejects a missing or whitespace-only question text', () => {
  for (const questionText of [undefined, null, '', '   ']) {
    assert.throws(
      () => validate({ questionText, options: [{ optionText: 'A', isCorrect: true }, { optionText: 'B', isCorrect: false }] }, 'MCQ_SINGLE'),
      error => error.code === 'PROMPT_REQUIRED',
    );
  }
});

test('MCQ rejects missing options and a single option', () => {
  for (const options of [undefined, null, [], [{ optionText: 'A', isCorrect: true }]]) {
    assert.throws(
      () => validate({ questionText: '<p>Question</p>', options }, 'MCQ_SINGLE'),
      error => error.code === 'OPTIONS_MINIMUM',
    );
  }
});

test('MCQ rejects empty option content', () => {
  for (const emptyText of [undefined, null, '', '   ']) {
    assert.throws(
      () => validate({
        questionText: '<p>Question</p>',
        options: [{ optionText: 'A', isCorrect: true }, { optionText: emptyText, isCorrect: false }],
      }, 'MCQ_SINGLE'),
      error => error.code === 'OPTION_TEXT_REQUIRED',
    );
  }
});

test('MCQ requires exactly one correct option', () => {
  const options = [
    { optionText: 'A', isCorrect: false },
    { optionText: 'B', isCorrect: false },
    { optionText: 'C', isCorrect: false },
  ];
  assert.throws(
    () => validate({ questionText: '<p>Question</p>', options }, 'MCQ_SINGLE'),
    error => error.code === 'CORRECT_OPTION_REQUIRED',
  );
  assert.throws(
    () => validate({ questionText: '<p>Question</p>', options: options.map((option, index) => ({ ...option, isCorrect: index < 2 })) }, 'MCQ_SINGLE'),
    error => error.code === 'CORRECT_OPTION_REQUIRED',
  );
});

test('MCQ accepts 2, 3 and 4 non-empty options with one correct answer and no option_key', () => {
  for (const optionCount of [2, 3, 4]) {
    const options = Array.from({ length: optionCount }, (_, index) => ({
      optionText: `Đáp án ${index + 1}`,
      isCorrect: index === optionCount - 1,
    }));
    assert.doesNotThrow(() => validate({ questionText: '<p>Nội dung câu hỏi</p>', options }, 'MCQ_SINGLE'));
  }
});

test('Record allows preparation duration >= 0 and requires positive recording duration', () => {
  assert.doesNotThrow(() => validate({
    questionText: '<p>Speak</p>',
    preparationDurationSeconds: 60,
    recordingDurationSeconds: 120,
  }, 'RECORD'));
  assert.doesNotThrow(() => validate({ questionText: 'Speak', preparationDurationSeconds: 0, recordingDurationSeconds: 120 }, 'RECORD'));
  assert.throws(() => validate({ questionText: 'Speak', preparationDurationSeconds: -1, recordingDurationSeconds: 120 }, 'RECORD'), error => error.code === 'PREPARATION_DURATION_INVALID');
  assert.throws(() => validate({ questionText: 'Speak', preparationDurationSeconds: 60, recordingDurationSeconds: 0 }, 'RECORD'), error => error.code === 'RECORDING_DURATION_INVALID');
});

test('Record rejects negative, decimal and malformed durations', () => {
  const valid = { questionText: '<p>Speak now</p>', preparationDurationSeconds: 60, recordingDurationSeconds: 120 };
  // Preparation duration allows 0; only genuinely non-integer / negative values are rejected.
  for (const preparationDurationSeconds of [undefined, -1, 1.5, 'abc']) {
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
});

test('Record requires question content but treats audio as optional', () => {
  const durations = { preparationDurationSeconds: 60, recordingDurationSeconds: 120 };
  for (const questionText of [undefined, null, '', '   ']) {
    assert.throws(() => validate({ ...durations, questionText }, 'RECORD'), error => error.code === 'PROMPT_REQUIRED');
  }
  assert.doesNotThrow(() => validate({ ...durations, questionText: '<p>Describe your daily routine.</p>' }, 'RECORD'));
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

test('Media validation accepts WAV and rejects unsupported MIME, oversized and missing files', () => {
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

test('media type slugs map only to audio, image and video', () => {
  assert.equal(mediaTypeFromSlug('audio'), 'AUDIO');
  assert.equal(mediaTypeFromSlug('image'), 'IMAGE');
  assert.equal(mediaTypeFromSlug('video'), 'VIDEO');
  assert.throws(() => mediaTypeFromSlug('document'), error => error.code === 'MEDIA_TYPE_SLUG_INVALID');
});

test('Record preparation and writing limits are persisted by repository and migration', () => {
  const repository = read('src/modules/question-bank-v3/subQuestionRepository.js');
  const migration = read('src/database/migrations/104_question_bank_management_redesign.sql');
  assert.match(repository, /preparationDurationSeconds:\s*r\.preparation_duration_seconds/);
  assert.match(repository, /maxCharacterCount:\s*r\.max_character_count/);
  assert.match(repository, /minWordCount:\s*r\.min_word_count/);
  assert.match(repository, /audioMediaId:\s*r\.audio_media_id/);
  assert.match(repository, /audio_media_id=CASE WHEN \$12::boolean THEN \$13::uuid ELSE audio_media_id END/);
  assert.match(repository, /UPDATE question_bank_media SET sub_question_id=\$2/);
  assert.match(repository, /SUB_QUESTION_AUDIO_INVALID/);
  assert.match(migration, /audio_media_id UUID/);
});

test('Writing requires positive maximum characters and non-negative minimum words', () => {
  assert.doesNotThrow(() => validate({ questionText: '<p>Write an essay</p>', maxCharacterCount: 2500, minWordCount: 250 }, 'WRITING'));
  assert.doesNotThrow(() => validate({ questionText: 'Write', maxCharacterCount: 2500, minWordCount: 0 }, 'WRITING'));
  assert.throws(() => validate({ questionText: 'Write', maxCharacterCount: 0, minWordCount: 250 }, 'WRITING'), error => error.code === 'MAX_CHARACTER_COUNT_INVALID');
  assert.throws(() => validate({ questionText: 'Write', maxCharacterCount: 2500, minWordCount: -1 }, 'WRITING'), error => error.code === 'MIN_WORD_COUNT_INVALID');
});

test('Writing database constraint allows zero minimum words', () => {
  const migration = read('src/database/migrations/106_allow_zero_min_word_count.sql');
  assert.match(migration, /min_word_count >= 0/);
});

test('type-specific normalization prevents irrelevant answer and duration fields from being persisted', () => {
  const options = [{ optionText: 'A', isCorrect: true }, { optionText: 'B', isCorrect: false }];
  const record = normalizeForType({ questionText: 'Speak', options, preparationDurationSeconds: 10, recordingDurationSeconds: 20, maxCharacterCount: 500 }, 'RECORD');
  assert.equal(record.options, undefined);
  assert.equal(record.maxCharacterCount, null);
  assert.equal(record.recordingDurationSeconds, 20);

  const writing = normalizeForType({ questionText: 'Write', options, preparationDurationSeconds: 10, maxCharacterCount: 500, minWordCount: 20 }, 'WRITING');
  assert.equal(writing.options, undefined);
  assert.equal(writing.preparationDurationSeconds, null);
  assert.equal(writing.maxCharacterCount, 500);

  const mcq = normalizeForType({ questionText: 'Choose', options, recordingDurationSeconds: 20, maxCharacterCount: 500 }, 'MCQ_SINGLE');
  assert.deepEqual(mcq.options, options);
  assert.equal(mcq.recordingDurationSeconds, null);
  assert.equal(mcq.maxCharacterCount, null);
});

test('question deletion reports business conflicts for active and in-use questions', () => {
  const source = read('src/modules/question-bank-v3/questionService.js');
  assert.match(source, /ACTIVE_QUESTION_DELETE_FORBIDDEN/);
  assert.match(source, /exam_part_questions WHERE question_id=\$1/);
  assert.match(source, /QUESTION_IN_USE/);
  assert.match(source, /jsonb_path_exists/);
  assert.match(source, /QUESTION_IN_VERSION/);
});
