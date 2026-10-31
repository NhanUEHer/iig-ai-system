const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRtaGroupResult } = require('../src/modules/iig-ai-scoring/rtaGroupResultParser');

function result(overrides = {}) {
  return {
    schema_version: 'rta-group-result-v1',
    job_id: 'job-1',
    keycode: 'KEYCODE1',
    group_code: 'READ_TEXT_ALOUD',
    group_final_score: 2,
    versions: { group_prompt: 'rta-group-prompt-v1' },
    ...overrides,
  };
}

test('parses the strict RTA group result contract', () => {
  const parsed = parseRtaGroupResult(JSON.stringify(result()));
  assert.equal(parsed.groupFinalScore, 2);
  assert.equal(parsed.versions.groupPrompt, 'rta-group-prompt-v1');
});

test('rejects invalid scores and unknown output fields', () => {
  assert.throws(() => parseRtaGroupResult(result({ group_final_score: 4 })));
  assert.throws(() => parseRtaGroupResult(result({ rationale: 'not allowed' })));
});
