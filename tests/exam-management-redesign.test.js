const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const HttpError = require('../src/http/httpError');
const constants = require('../src/modules/exams/examConstants');
const validator = require('../src/modules/exams/examValidator');
const calc = require('../src/modules/exams/durationCalculator');
const audioMetadata = require('../src/modules/question-bank-v3/audioMetadata');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// ---------------------------------------------------------------------------
// Migration contract
// ---------------------------------------------------------------------------
test('migration 107 introduces exam type, sections, part content and media duration', () => {
  const sql = read('src/database/migrations/107_exam_management_redesign.sql');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS exam_type VARCHAR/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS published_snapshot JSONB/);
  assert.match(sql, /chk_exams_exam_type/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS exam_sections/);
  assert.match(sql, /exam_mode VARCHAR/);
  assert.match(sql, /configured_duration_seconds INTEGER NOT NULL/);
  assert.match(sql, /score_scale_id UUID/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS section_id UUID/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS instruction_html TEXT/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS instruction_audio_media_id UUID/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS break_duration_seconds INTEGER NOT NULL DEFAULT 0/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC/);
  // Non-destructive: no DROP TABLE / DROP COLUMN of legacy data.
  assert.doesNotMatch(sql, /DROP TABLE/i);
  assert.doesNotMatch(sql, /DROP COLUMN/i);
});

test('migration 108 gives Part audio an explicit ownership target', () => {
  const sql = read('src/database/migrations/108_exam_part_instruction_media.sql');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS part_id UUID REFERENCES exam_parts/);
  assert.match(sql, /ALTER COLUMN question_id DROP NOT NULL/);
  assert.match(sql, /part_id IS NOT NULL AND question_id IS NULL/);
  assert.match(sql, /duration_seconds IS NULL OR duration_seconds > 0/);
});

test('migration 110 stores Writing duration per Part in seconds', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../src/database/migrations/110_exam_part_configured_duration.sql'), 'utf8');
  assert.match(sql, /configured_duration_seconds INTEGER NOT NULL DEFAULT 0/i);
  assert.match(sql, /duration_minutes \* 60/i);
  assert.match(sql, /CHECK \(configured_duration_seconds >= 0\)/i);
});

test('migration 112 preserves legacy LR Parts by assigning them to Sections', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../src/database/migrations/112_backfill_legacy_lr_exam_sections.sql'), 'utf8');
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM exam_sections/);
  assert.match(sql, /'LISTENING_READING'/);
  assert.match(sql, /UPDATE exam_parts SET[\s\S]*section_id=new_section_id/);
  assert.match(sql, /GREATEST\(child_count,1\)/);
});

// ---------------------------------------------------------------------------
// Constants + compatibility matrix
// ---------------------------------------------------------------------------
test('exam types and modes match the approved six/four enumerations', () => {
  assert.deepEqual(constants.EXAM_TYPES.slice().sort(), ['LISTENING', 'LISTENING_READING', 'READING', 'SPEAKING', 'SPEAKING_WRITING', 'WRITING'].sort());
  assert.deepEqual(constants.EXAM_MODES.slice().sort(), ['FREESTYLE', 'NON_STOP', 'RECORD_NON_STOP', 'WRITING_NON_STOP'].sort());
});

test('exam-type to exam-mode compatibility matrix follows the spec', () => {
  assert.deepEqual(constants.modesForExamType('LISTENING'), ['NON_STOP']);
  assert.deepEqual(constants.modesForExamType('READING'), ['FREESTYLE']);
  assert.deepEqual(constants.modesForExamType('LISTENING_READING').sort(), ['FREESTYLE', 'NON_STOP']);
  assert.deepEqual(constants.modesForExamType('SPEAKING'), ['RECORD_NON_STOP']);
  assert.deepEqual(constants.modesForExamType('WRITING'), ['WRITING_NON_STOP']);
  assert.deepEqual(constants.modesForExamType('SPEAKING_WRITING').sort(), ['RECORD_NON_STOP', 'WRITING_NON_STOP']);
  assert.equal(constants.isModeCompatible('LISTENING', 'FREESTYLE'), false);
  assert.equal(constants.isModeCompatible('LISTENING_READING', 'FREESTYLE'), true);
});

test('mode question types map to the correct question bank type', () => {
  assert.equal(constants.MODE_QUESTION_TYPE.NON_STOP, 'MCQ_SINGLE');
  assert.equal(constants.MODE_QUESTION_TYPE.FREESTYLE, 'MCQ_SINGLE');
  assert.equal(constants.MODE_QUESTION_TYPE.RECORD_NON_STOP, 'RECORD');
  assert.equal(constants.MODE_QUESTION_TYPE.WRITING_NON_STOP, 'WRITING');
});

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------
const validExam = { title: 'TOEIC LR 01', status: 'DRAFT', examType: 'LISTENING_READING', introduction: '<p>Đọc kỹ hướng dẫn.</p>' };

test('exam validator enforces the redesigned five-field contract', () => {
  assert.throws(() => validator.validateExam({ ...validExam, title: '' }), e => e.code === 'EXAM_TITLE_REQUIRED');
  assert.throws(() => validator.validateExam({ ...validExam, examType: undefined }), e => e.code === 'EXAM_TYPE_REQUIRED');
  assert.throws(() => validator.validateExam({ ...validExam, examType: 'TOEIC' }), e => e.code === 'EXAM_TYPE_INVALID');
  assert.doesNotThrow(() => validator.validateExam({ ...validExam, introduction: '<p>&nbsp;</p>' }));
  assert.doesNotThrow(() => validator.validateExam({ ...validExam, introduction: undefined }));
  assert.doesNotThrow(() => validator.validateExam(validExam));
  // No exam-level duration is part of the contract.
  assert.doesNotThrow(() => validator.validateExam({ ...validExam, durationSeconds: 0 }));
});

test('section validator enforces mode, positive count and positive duration', () => {
  const base = { title: 'Listening', examMode: 'NON_STOP', questionCount: 10, configuredDurationSeconds: 1800 };
  assert.throws(() => validator.validateSection({ ...base, examMode: 'X' }), e => e.code === 'SECTION_MODE_INVALID');
  assert.throws(() => validator.validateSection({ ...base, questionCount: 0 }), e => e.code === 'SECTION_QUESTION_COUNT_INVALID');
  assert.throws(() => validator.validateSection({ ...base, configuredDurationSeconds: 0 }), e => e.code === 'SECTION_DURATION_INVALID');
  assert.doesNotThrow(() => validator.validateSection(base));
});

test('part creation needs only a title; content fields are optional', () => {
  assert.throws(() => validator.validatePartCreate({ title: '  ' }), e => e.code === 'PART_TITLE_REQUIRED');
  assert.doesNotThrow(() => validator.validatePartCreate({ title: 'Part 1' }));
  assert.doesNotThrow(() => validator.validatePartContent({}));
  assert.doesNotThrow(() => validator.validatePartContent({ instructionHtml: '<p>ok</p>', breakDurationSeconds: 0 }));
  assert.throws(() => validator.validatePartContent({ breakDurationSeconds: -1 }), e => e.code === 'PART_BREAK_DURATION_INVALID');
  assert.doesNotThrow(() => validator.validatePartContent({ configuredDurationSeconds: 1800 }));
  assert.throws(() => validator.validatePartContent({ configuredDurationSeconds: -1 }), e => e.code === 'PART_DURATION_INVALID');
});

// ---------------------------------------------------------------------------
// Duration calculator
// ---------------------------------------------------------------------------
test('Listening question duration equals content audio only', () => {
  assert.equal(calc.questionActualDuration('NON_STOP', { contentAudioSeconds: 42, subAudioSeconds: 99 }), 42);
  assert.equal(calc.questionActualDuration('FREESTYLE', { contentAudioSeconds: 42 }), null);
  assert.equal(calc.questionActualDuration('WRITING_NON_STOP', { contentAudioSeconds: 42 }), null);
});

test('Speaking question duration sums content audio, sub audio, preparation and recording', () => {
  const source = { contentAudioSeconds: 10, subAudioSeconds: 5, preparationSeconds: 30, recordingSeconds: 60 };
  assert.equal(calc.questionActualDuration('RECORD_NON_STOP', source), 105);
});

test('Part duration adds instruction audio and (N-1) breaks for 0, 1, 2 and 50 questions', () => {
  const mk = n => Array.from({ length: n }, () => 10);
  // 0 questions: instruction audio only, no breaks.
  assert.equal(calc.partActualDuration('NON_STOP', { instructionAudioSeconds: 7, questionDurations: mk(0), breakDurationSeconds: 5 }), 7);
  // 1 question: no break.
  assert.equal(calc.partActualDuration('NON_STOP', { instructionAudioSeconds: 7, questionDurations: mk(1), breakDurationSeconds: 5 }), 17);
  // 2 questions: exactly one break.
  assert.equal(calc.partActualDuration('NON_STOP', { instructionAudioSeconds: 0, questionDurations: mk(2), breakDurationSeconds: 5 }), 25);
  // 50 questions: 49 breaks.
  assert.equal(calc.partActualDuration('NON_STOP', { instructionAudioSeconds: 0, questionDurations: mk(50), breakDurationSeconds: 5 }), 50 * 10 + 49 * 5);
  // Reading/Writing parts are not timed.
  assert.equal(calc.partActualDuration('FREESTYLE', { questionDurations: mk(3) }), null);
  assert.equal(calc.partActualDuration('WRITING_NON_STOP', { instructionAudioSeconds: 20, configuredDurationSeconds: 1800 }), 1800);
  assert.equal(calc.sectionActualDuration('WRITING_NON_STOP', [1800, 1200]), 3000);
});

test('Section and exam totals only aggregate timed modes and expose the difference', () => {
  assert.equal(calc.sectionActualDuration('NON_STOP', [10, 20, 30]), 60);
  assert.equal(calc.sectionActualDuration('FREESTYLE', [10, 20]), null);
  assert.equal(calc.examConfiguredDuration([{ configuredDurationSeconds: 100 }, { configuredDurationSeconds: 200 }]), 300);
  assert.equal(calc.examActualDuration([60, null, 40]), 100);
  const comparison = calc.durationComparison(90, 100);
  assert.deepEqual(comparison, { configuredDurationSeconds: 90, actualDurationSeconds: 100, durationDifferenceSeconds: 10 });
  assert.equal(calc.durationComparison(90, null).durationDifferenceSeconds, null);
});

test('exam detail exposes each question duration for the editor table', () => {
  const source = read('src/modules/exams/examService.js');
  assert.match(source, /q\.actualDurationSeconds = duration/);
});

// ---------------------------------------------------------------------------
// Repository contract (source assertions)
// ---------------------------------------------------------------------------
test('eligibility SQL applies mode-specific content/audio rules', () => {
  const source = read('src/modules/exams/examRepository.js');
  // NON_STOP / RECORD_NON_STOP require exactly one content with a ready audio.
  assert.match(source, /question_bank_contents c WHERE c\.question_id=q\.id\)=1/);
  assert.match(source, /JOIN question_bank_media m ON m\.id=c\.audio_media_id WHERE c\.question_id=q\.id AND m\.media_type='AUDIO'/);
  // Excludes questions already used anywhere in the exam.
  assert.match(source, /NOT EXISTS\(SELECT 1 FROM exam_part_questions used WHERE used\.exam_id=/);
  // The picker group filter must be applied by the API, not only rendered by the UI.
  assert.match(source, /q\.group_id=\$\$\{params\.push\(String\(groupId\)\.trim\(\)\)\}/);
  assert.match(source, /audio_duration_seconds/);
});

test('cascade delete removes descendants without deleting source questions', () => {
  const source = read('src/modules/exams/examRepository.js');
  assert.match(source, /DELETE FROM exam_part_questions WHERE exam_id=\$1 AND part_id IN \(SELECT id FROM exam_parts WHERE section_id=\$2\)/);
  assert.match(source, /DELETE FROM exam_parts WHERE exam_id=\$1 AND section_id=\$2/);
  assert.match(source, /DELETE FROM exam_sections WHERE id=\$1 AND exam_id=\$2/);
  assert.doesNotMatch(source, /DELETE FROM question_bank_questions/);
});

test('publish replaces a single version row and mirrors published_snapshot without history', () => {
  const source = read('src/modules/exams/examRepository.js');
  assert.match(source, /replacePublishedSnapshot/);
  assert.match(source, /UPDATE exam_versions SET snapshot=\$2/);
  assert.match(source, /NOT EXISTS\(SELECT 1 FROM exam_attempts a WHERE a\.exam_version_id=v\.id\)/);
  assert.match(source, /published_snapshot=\$3/);
});

test('published snapshot keeps scoring and content linkage required by candidate delivery', () => {
  const source = read('src/modules/exams/examRepository.js');
  assert.match(source, /pointsPerSubQuestion:\s*10/);
  assert.match(source, /SELECT id,content_id,prompt_text AS prompt_html/);
});

test('audio metadata reader obtains backend duration from a WAV buffer', async () => {
  const sampleRate = 8000;
  const seconds = 1;
  const dataSize = sampleRate * seconds * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + dataSize, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(dataSize, 40);
  assert.equal(await audioMetadata.durationSeconds(wav, 'sample.wav'), 1);
});

// ---------------------------------------------------------------------------
// Service behaviour (with stubs)
// ---------------------------------------------------------------------------
test('creating an exam always persists DRAFT via the repository', async () => {
  const service = require('../src/modules/exams/examService');
  const repo = require('../src/modules/exams/examRepository');
  const original = repo.create;
  const calls = [];
  repo.create = async (data, userId) => { calls.push({ data, userId }); return { id: 'e1', ...data, status: 'DRAFT' }; };
  try {
    await service.create(validExam, 'user-1');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].data.examType, 'LISTENING_READING');
  } finally { repo.create = original; }
});

test('exam type cannot change once sections exist', async () => {
  const service = require('../src/modules/exams/examService');
  const repo = require('../src/modules/exams/examRepository');
  const db = require('../src/config/db');
  const originalTransaction = db.transaction;
  const originalLock = repo.lockExam;
  const originalCount = repo.countSections;
  const client = { query: async () => ({ rows: [] }) };
  db.transaction = async work => work(client);
  repo.lockExam = async (_id, receivedClient) => {
    assert.equal(receivedClient, client);
    return { id: 'e1', status: 'DRAFT', examType: 'LISTENING' };
  };
  repo.countSections = async (_id, receivedClient) => {
    assert.equal(receivedClient, client);
    return 2;
  };
  try {
    await assert.rejects(
      () => service.update('e1', { examType: 'READING' }, 'user-1'),
      e => e instanceof HttpError && e.code === 'EXAM_TYPE_IMMUTABLE_WITH_SECTIONS',
    );
  } finally {
    db.transaction = originalTransaction;
    repo.lockExam = originalLock;
    repo.countSections = originalCount;
  }
});

test('adding an ineligible question is rejected with a business error code', async () => {
  const service = require('../src/modules/exams/examService');
  await assert.rejects(
    () => service.addQuestions('e1', 's1', 'p1', ['a', 'a']),
    e => e instanceof HttpError && e.code === 'DUPLICATE_QUESTIONS',
  );
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
test('exam V3 routes expose section, part, question, validation and publish operations', () => {
  const layers = require('../src/routes/examV3Routes').stack.map(l => l.route).filter(Boolean);
  const paths = layers.map(r => r.path);
  const detail = paths.indexOf('/:examId');
  const required = [
    '/:examId/sections', '/:examId/sections/reorder', '/:examId/sections/:sectionId',
    '/:examId/sections/:sectionId/parts', '/:examId/sections/:sectionId/parts/reorder',
    '/:examId/sections/:sectionId/parts/:partId',
    '/:examId/sections/:sectionId/parts/:partId/instruction-audio',
    '/:examId/sections/:sectionId/parts/:partId/questions',
    '/:examId/parts/:partId/available-questions',
    '/:examId/validation', '/:examId/publish',
  ];
  for (const p of required) {
    assert.ok(paths.includes(p), `${p} must exist`);
    assert.ok(paths.indexOf(p) < detail, `${p} must precede /:examId`);
  }
  assert.ok(!paths.includes('/:examId/activate'), 'legacy activate route is replaced by publish');
});

test('public attempt routes expose staged exam delivery endpoints', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/publicExamEventRoutes.js'), 'utf8');
  for (const route of ['/manifest', '/structure', '/parts/:partId/questions', '/questions/:subQuestionId']) assert.match(source, new RegExp(route.replaceAll('/', '\\/')));
});
