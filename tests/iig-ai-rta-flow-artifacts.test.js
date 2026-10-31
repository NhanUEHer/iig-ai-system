const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const questionPath = path.join(
  __dirname,
  '../dify-flows/iig-scoring/01-read-text-aloud-v2.yml'
);

test('RTA question artifact preserves every distinct concrete error', () => {
  const source = fs.readFileSync(questionPath, 'utf8');
  assert.match(source, /Return every distinct, clearly supported error occurrence/);
  assert.match(source, /error_prompt_version\": \"rta-error-v10/);
  assert.match(source, /by_exact_key = \{\}/);
  assert.doesNotMatch(source, /Return at most one object for each error_type/);
  assert.doesNotMatch(source, /merged = \{\}/);
});
