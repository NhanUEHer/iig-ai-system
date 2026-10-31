const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const questionPath = path.join(
  __dirname,
  '../dify-flows/iig-scoring/02-describe-a-picture-v2.yml'
);
const groupPath = path.join(
  __dirname,
  '../dify-flows/iig-scoring/02-describe-a-picture-group-v1.yml'
);

test('Describe Picture question artifact keeps its isolated contract and progressive stages', () => {
  const source = fs.readFileSync(questionPath, 'utf8');
  assert.match(source, /name: IIG Describe Picture Question Flow v2/);
  assert.match(source, /describe-picture-question-input-v1/);
  assert.match(source, /describe-picture-question-result-v1/);
  assert.match(source, /describe-picture-progress-event-v1/);
  assert.match(source, /variable: prompt_image/);
  assert.match(source, /variable: student_audio/);
  assert.match(source, /value: WRONG_PICTURE/);
  assert.match(source, /max_output_tokens: 2000/);
  assert.match(source, /max_output_tokens: 2500/);
  assert.match(source, /max_output_tokens: 1500/);
  assert.match(source, /SCORE_READY/);
  assert.match(source, /ERRORS_READY/);
  assert.match(source, /COMMENT_READY/);
  assert.match(source, /EXCESSIVE_FILLERS_PENALTY/);
  assert.match(source, /CUT_OFF_PENALTY/);
  assert.match(source, /INANIMATE_ACTION_PENALTY/);
  assert.match(source, /describe-picture-error-v3/);
  assert.match(source, /Return every distinct, clearly supported error occurrence/);
  assert.doesNotMatch(source, /maxItems: 6|one object per error_type/);
  assert.doesNotMatch(source, /READ_TEXT_ALOUD|s_q1|s_q2|rta-question-result/);
});

test('Describe Picture group artifact accepts locked Q3/Q4 results and enforces the group matrix', () => {
  const source = fs.readFileSync(groupPath, 'utf8');
  assert.match(source, /name: IIG Describe Picture Group Flow v2/);
  assert.match(source, /describe-picture-group-input-v1/);
  assert.match(source, /describe-picture-group-result-v1/);
  assert.match(source, /s_q3/);
  assert.match(source, /s_q4/);
  assert.match(source, /pronunciation_score/);
  assert.match(source, /intonation_fluency_score/);
  assert.match(source, /grammar_score/);
  assert.match(source, /vocabulary_score/);
  assert.match(source, /cohesion_score/);
  assert.match(source, /AUTHORITATIVE GROUP MATRIX/);
  assert.match(source, /0 \+ 3 => 1/);
  assert.match(source, /1 \+ 3 => 2/);
  assert.match(source, /3 \+ 3 => 3/);
  assert.match(source, /deterministic_group_score/);
  assert.match(source, /describe-picture-group-prompt-v2/);
  assert.doesNotMatch(source, /READ_TEXT_ALOUD|s_q1|s_q2|rta-group-result/);
});
