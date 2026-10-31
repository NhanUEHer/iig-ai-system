const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { PROFILE } = require('../src/modules/iig-ai-scoring/expressOpinionProfile');

const flowPath = path.join(
  __dirname, '../dify-flows/iig-scoring/05-express-an-opinion-v2.yml'
);

test('Q11 Dify artifact has isolated progressive 0-5 scoring nodes', () => {
  const source = fs.readFileSync(flowPath, 'utf8');
  assert.match(source, /mode: workflow/);
  assert.match(source, /IIG Express an Opinion Q11 Flow v3/);
  assert.match(source, /default: s_q11/);
  assert.match(source, /id: opn-v2-score-extended/);
  assert.match(source, /id: opn-v2-errors/);
  assert.match(source, /id: opn-v2-comment/);
  assert.match(source, /id: opn-v2-assemble/);
  assert.doesNotMatch(source, /id: opn-v2-score-aggregator/);
  assert.doesNotMatch(source, /id: opn-v2-profile-route/);
  assert.match(source, /holistic_score_preliminary/);
  assert.match(source, /question_score_final/);
  assert.doesNotMatch(source, /question_score_raw/);
  assert.doesNotMatch(source, /question_score_rounded/);
  assert.match(source, /express-opinion-score-v3/);
  assert.match(source, /express-opinion-error-v3/);
  assert.match(source, /express-opinion-comment-v3/);
  assert.match(source, /SOURCE PRIORITY/);
  assert.match(source, /DIAGNOSIS RULES/);
  assert.doesNotMatch(source, /maxItems/);
  assert.doesNotMatch(source, /minItems/);
  assert.match(source, /express-opinion-progress-event-v1/);
  assert.doesNotMatch(source, /respond-questions-question-result-v1/);
  assert.equal(PROFILE.defaultPromptVersion, 'express-opinion-question-flow-v3');
});
