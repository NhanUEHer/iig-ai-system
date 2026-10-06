const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../scripts/load-test/public-lr-exam.js'), 'utf8');

test('LR load test follows the direct public exam lifecycle', () => {
  assert.match(source, /\/api\/public\/exams\?search=/);
  assert.match(source, /\/api\/public\/exams\/\$\{data\.examId\}/);
  assert.match(source, /clientSessionId: deterministicUuid/);
  assert.match(source, /LISTENING_READING/);
  assert.match(source, /\/question-groups\/\$\{group\.id\}/);
  assert.match(source, /\/answers\/\$\{question\.id\}/);
  assert.match(source, /\/resume/);
  assert.match(source, /\/submit/);
  assert.match(source, /\/result/);
  assert.doesNotMatch(source, /public\/exam-events/);
});

test('LR load test validates durable resume, scoring, and optional idempotency', () => {
  assert.match(source, /all saved answers recovered/);
  assert.match(source, /answered total preserved/);
  assert.match(source, /score matches submit/);
  assert.match(source, /VERIFY_IDEMPOTENCY/);
  assert.match(source, /POSTGRESQL_FALLBACK/);
});

test('direct LR regression script covers session conflict through persisted result', () => {
  const regression = fs.readFileSync(path.join(__dirname, '../scripts/test-direct-lr-e2e.js'), 'utf8');
  assert.match(regression, /ATTEMPT_ACTIVE_ON_ANOTHER_DEVICE/);
  assert.match(regression, /answeredQuestionIds/);
  assert.match(regression, /INVALID_SELECTED_OPTION/);
  assert.match(regression, /alreadySubmitted/);
  assert.match(regression, /exam_attempt_answers/);
  assert.match(regression, /exam_attempt_section_scores/);
});
