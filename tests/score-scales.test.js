const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const validator = require('../src/modules/score-scales/scoreScaleValidator');
const repository = require('../src/modules/score-scales/scoreScaleRepository');
const service = require('../src/modules/score-scales/scoreScaleService');

const validScale = {
  name: 'LR 2 câu',
  questionCount: 2,
  minScore: 5,
  maxScore: 15,
  scoreStep: 5,
  rawRanges: [
    { correctCount: 0, convertedScore: 5 },
    { correctCount: 1, convertedScore: 10 },
    { correctCount: 2, convertedScore: 15 },
  ],
};

test('score scale requires monotonic mappings with exact minimum and maximum endpoints', () => {
  assert.doesNotThrow(() => validator.validateCreate(validScale));
  assert.throws(
    () => validator.validateCreate({ ...validScale, rawRanges: [
      { correctCount: 0, convertedScore: 5 },
      { correctCount: 1, convertedScore: 15 },
      { correctCount: 2, convertedScore: 10 },
    ] }),
    error => error.code === 'SCORE_SCALE_CONVERTED_SCORE_NOT_MONOTONIC',
  );
  assert.throws(
    () => validator.validateCreate({ ...validScale, rawRanges: [
      { correctCount: 0, convertedScore: 10 },
      { correctCount: 1, convertedScore: 10 },
      { correctCount: 2, convertedScore: 15 },
    ] }),
    error => error.code === 'SCORE_SCALE_ENDPOINTS_INVALID',
  );
});

test('score scale validation is based on correct count rather than request order', () => {
  assert.doesNotThrow(() => validator.validateCreate({
    ...validScale,
    rawRanges: [...validScale.rawRanges].reverse(),
  }));
});

test('activated or referenced score scales cannot be restored to an editable draft', async () => {
  const originalFindById = repository.findById;
  const originalSetStatus = repository.setStatus;
  let statusWritten = false;
  repository.findById = async () => ({ ...validScale, id: '10000000-0000-4000-8000-000000000001', status: 'ACTIVE', usageCount: 1 });
  repository.setStatus = async () => { statusWritten = true; };
  try {
    await assert.rejects(
      () => service.setStatus('10000000-0000-4000-8000-000000000001', 'DRAFT', null),
      error => error.code === 'SCORE_SCALE_DRAFT_RESTORE_FORBIDDEN',
    );
    assert.equal(statusWritten, false);
  } finally {
    repository.findById = originalFindById;
    repository.setStatus = originalSetStatus;
  }
});

test('admin routes separate score-scale viewing from management', () => {
  const source = fs.readFileSync(path.join(__dirname, '../frontend/src/App.jsx'), 'utf8');
  assert.match(source, /path="\/score-scales\/:id\/edit"[^\n]+hasPermission\('exams\.view'\)/);
  assert.match(source, /ScoreScaleListPage[^\n]+canManage=\{hasPermission\('exams\.manage'\)\}/);
  assert.match(source, /path\.startsWith\('\/score-scales'\).*activeTab = 'score-scales'/);
});
