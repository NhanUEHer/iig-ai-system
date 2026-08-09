const assert = require('node:assert/strict');
const test = require('node:test');

const { parseGradingResult } = require('../src/modules/scoring/gradingResultParser');
const { calculateFinalScore } = require('../src/modules/scoring/scoreCalculator');

test('grading parser normalizes aliases and preserves numeric zero', () => {
  const result = parseGradingResult({
    pronunciation_score: 0,
    organization_score: '4',
    quality_variety_score: '3',
    keyword_score: '2',
    support_score: '1',
    result: '```json\n{"transcribe":"hello","errors":["e1"],"overall_1":"ok"}\n```'
  });

  assert.equal(result.pronunciationScore, 0);
  assert.equal(result.cohesionScore, '4');
  assert.equal(result.grammarScore, '3');
  assert.equal(result.vocabularyScore, '2');
  assert.equal(result.relevanceScore, '1');
  assert.equal(result.transcribe, 'hello');
  assert.equal(result.errors, '["e1"]');
});

test('Speaking scores use the configured criteria groups', () => {
  assert.equal(calculateFinalScore(
    { section: 'Speaking', question_no: 1 },
    { pronunciationScore: 4, intonationScore: 2, finalScore: 99 }
  ), 3);
  assert.equal(calculateFinalScore(
    { section: 'Speaking', question_no: 3 },
    { cohesionScore: 5, grammarScore: 4, intonationScore: 3, pronunciationScore: 2, vocabularyScore: 1 }
  ), 3);
  assert.equal(calculateFinalScore(
    { section: 'Speaking', question_no: 11 },
    {
      pronunciationScore: 7, intonationScore: 6, cohesionScore: 5, grammarScore: 4,
      vocabularyScore: 3, completenessScore: 2, relevanceScore: 1
    }
  ), 4);
});

test('Writing score keeps workflow score or derives it from available criteria', () => {
  assert.equal(calculateFinalScore(
    { section: 'Writing', question_no: 2 },
    { finalScore: 3, grammarScore: 0, relevanceScore: 0, vocabularyScore: 0 }
  ), 3);
  assert.equal(calculateFinalScore(
    { section: 'Writing', question_no: 2 },
    { finalScore: null, grammarScore: 3, relevanceScore: 2, vocabularyScore: 1 }
  ), 2);
  assert.equal(calculateFinalScore(
    { section: 'Writing', question_no: 7 },
    { finalScore: null, grammarScore: 4, relevanceScore: null, cohesionScore: 2, vocabularyScore: null }
  ), 3);
});
