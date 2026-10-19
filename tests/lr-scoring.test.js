const assert = require('node:assert/strict');
const test = require('node:test');
const scoring = require('../src/modules/public-exams/lrScoringService');

const scale = (id, code, scores) => ({
  id, code, name: code, scaleType: 'LR_RAW_CORRECT', status: 'ACTIVE', version: 1,
  questionCount: 2, minScore: 5, maxScore: 495, scoreStep: 5,
  rawRanges: scores.map((convertedScore, correctCount) => ({ correctCount, convertedScore })),
});

const listeningId = '11111111-1111-4111-8111-111111111111';
const readingId = '22222222-2222-4222-8222-222222222222';
const grading = {
  sections: {
    [listeningId]: { id: listeningId, title: 'Listening', examMode: 'NON_STOP', questionCount: 2, scoreScale: scale('33333333-3333-4333-8333-333333333333', 'LISTENING-2', [5, 250, 495]) },
    [readingId]: { id: readingId, title: 'Reading', examMode: 'FREESTYLE', questionCount: 2, scoreScale: scale('44444444-4444-4444-8444-444444444444', 'READING-2', [5, 245, 495]) },
  },
  questions: {
    l1: { subQuestionId: 'l1', parentQuestionId: 'pl1', sectionId: listeningId, partId: 'lp', partTitle: 'Listening Part 1', correctOptionKey: 'A', correctOptionCount: 1 },
    l2: { subQuestionId: 'l2', parentQuestionId: 'pl2', sectionId: listeningId, partId: 'lp', partTitle: 'Listening Part 1', correctOptionKey: 'B', correctOptionCount: 1 },
    r1: { subQuestionId: 'r1', parentQuestionId: 'pr1', sectionId: readingId, partId: 'rp', partTitle: 'Reading Part 1', correctOptionKey: 'C', correctOptionCount: 1 },
    r2: { subQuestionId: 'r2', parentQuestionId: 'pr2', sectionId: readingId, partId: 'rp', partTitle: 'Reading Part 1', correctOptionKey: 'D', correctOptionCount: 1 },
  },
};

test('LR scoring evaluates answers and converts each section independently', () => {
  const result = scoring.evaluate({ grading, answers: [
    { subQuestionId: 'l1', selectedOptionKey: 'A' },
    { subQuestionId: 'l2', selectedOptionKey: 'A' },
    { subQuestionId: 'r1', selectedOptionKey: 'C' },
  ] });
  assert.deepEqual({ total: result.totalQuestions, answered: result.answeredCount, unanswered: result.unansweredCount, correct: result.correctCount, incorrect: result.incorrectCount },
    { total: 4, answered: 3, unanswered: 1, correct: 2, incorrect: 1 });
  assert.equal(result.sectionResults[0].exactScore, 250);
  assert.equal(result.sectionResults[1].exactScore, 245);
  assert.equal(result.totalScore, 495);
  assert.equal(result.scoreRangeMin, 495);
  assert.equal(result.scoreRangeMax, 505);
  assert.equal(result.maxScore, 990);
  assert.equal(result.items.find(item => item.subQuestionId === 'l1').isCorrect, true);
  assert.equal(result.items.find(item => item.subQuestionId === 'l2').isCorrect, false);
  assert.equal(result.items.find(item => item.subQuestionId === 'r2').answered, false);
  assert.equal(result.items.find(item => item.subQuestionId === 'r2').isCorrect, null);
  assert.equal(result.items.find(item => item.subQuestionId === 'r2').score, null);
  assert.equal(result.partBreakdown[0].sectionId, listeningId);
  assert.equal(result.partBreakdown[0].accuracyPercent, 50);
  assert.equal(result.partBreakdown[1].unansweredCount, 1);
});

test('attempt result projection persists compact part breakdowns', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const sql = fs.readFileSync(path.join(__dirname, '../src/database/migrations/117_attempt_result_part_breakdown.sql'), 'utf8');
  const repository = fs.readFileSync(path.join(__dirname, '../src/modules/public-exams/attemptResultRepository.js'), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS part_breakdown JSONB/);
  assert.match(sql, /jsonb_typeof\(part_breakdown\) = 'array'/);
  assert.match(repository, /part_breakdown=\$13::jsonb/);
  const rankingSql = fs.readFileSync(path.join(__dirname, '../src/database/migrations/120_remove_exam_events.sql'), 'utf8');
  assert.match(rankingSql, /idx_exam_attempts_result_rank/);
  assert.match(rankingSql, /WHERE status='SUBMITTED'/);
});

test('LR scoring caps the score range at each section maximum', () => {
  const answers = Object.keys(grading.questions).map(subQuestionId => ({ subQuestionId, selectedOptionKey: grading.questions[subQuestionId].correctOptionKey }));
  const result = scoring.evaluate({ grading, answers });
  assert.equal(result.totalScore, 990);
  assert.equal(result.scoreRangeMax, 990);
});

test('LR scoring rejects missing scale mapping and invalid correct options', () => {
  const missing = structuredClone(grading);
  missing.sections[listeningId].scoreScale.rawRanges = missing.sections[listeningId].scoreScale.rawRanges.filter(row => row.correctCount !== 0);
  assert.throws(() => scoring.evaluate({ grading: missing }), error => error.code === 'SCORING_SCALE_MAPPING_MISSING');
  const invalid = structuredClone(grading);
  invalid.questions.l1.correctOptionCount = 0;
  assert.throws(() => scoring.evaluate({ grading: invalid }), error => error.code === 'SCORING_CORRECT_OPTION_INVALID');
});

test('attempt result migration stores answer correctness, section scores and indexed attempt summaries', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const sql = fs.readFileSync(path.join(__dirname, '../src/database/migrations/116_attempt_lr_scoring_results.sql'), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS is_correct BOOLEAN/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS exam_attempt_section_scores/);
  assert.match(sql, /UNIQUE \(attempt_id, section_id\)/);
  assert.match(sql, /idx_exam_attempts_exam_submitted/);
});
