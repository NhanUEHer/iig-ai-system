const assert = require('node:assert/strict');
const test = require('node:test');

const completion = require('../src/modules/iig-ai-scoring/writingCompletionRepository');

function rows(statuses = {}) {
  return completion.REQUIRED_POLICIES.map(scoringPolicyVersion => ({
    scoring_policy_version: scoringPolicyVersion,
    status: statuses[scoringPolicyVersion] || 'COMPLETED',
  }));
}

test('Writing remains processing until all three isolated runs are terminal', () => {
  assert.equal(completion.deriveWritingStatus([]), 'PROCESSING');
  assert.equal(completion.deriveWritingStatus(rows().slice(0, 2)), 'PROCESSING');
  assert.equal(completion.deriveWritingStatus(rows({
    'written-request-q6-q7-dify-policy-v1': 'SCORING_QUESTIONS',
  })), 'PROCESSING');
});

test('Writing completes after Q1-Q5, Q6-Q7 and Q8 runs complete', () => {
  assert.equal(completion.deriveWritingStatus(rows()), 'COMPLETED');
});

test('terminal technical failures fail Writing', () => {
  assert.equal(completion.deriveWritingStatus(rows({
    'opinion-essay-q8-dify-policy-v1': 'FAILED',
  })), 'FAILED');
});

test('review outcomes complete Writing with issues', () => {
  assert.equal(completion.deriveWritingStatus(rows({
    'opinion-essay-q8-dify-policy-v1': 'REVIEW_REQUIRED',
  })), 'COMPLETED_WITH_ISSUES');
});

test('duplicate or unrelated run rows cannot satisfy missing Writing policies', () => {
  const incomplete = [
    rows()[0],
    { ...rows()[0], status: 'COMPLETED' },
    { scoring_policy_version: 'unrelated-policy-v1', status: 'COMPLETED' },
  ];
  assert.equal(completion.deriveWritingStatus(incomplete), 'PROCESSING');
});

test('completion repository persists the derived Writing submission status', async () => {
  const calls = [];
  const responses = [
    { rows: [{ submission_id: 'submission-1' }] },
    { rows: rows().map((row, index) => ({ ...row, run_number: index + 1 })) },
    { rows: [] },
    { rows: [{ id: 'submission-1' }] },
    { rows: [{ overall_status: 'PROCESSING' }] },
  ];
  const executor = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return responses.shift();
    },
  };
  const result = await completion.refreshByRun(executor, 'run-1');
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.overallStatus, 'PROCESSING');
  assert.match(calls[3].sql, /FOR UPDATE/);
  assert.deepEqual(calls[4].params, ['submission-1', 'WRITING', 'COMPLETED']);
  assert.match(calls[4].sql, /iig_ai_section_statuses/);
  assert.match(calls[4].sql, /ai_scoring_completed_at/);
});

test('invalid prompt source acts as a terminal failed Writing policy', async () => {
  const validPolicies = completion.REQUIRED_POLICIES.slice(1).map(scoringPolicyVersion => ({
    scoring_policy_version: scoringPolicyVersion,
    status: 'COMPLETED',
    run_number: 1,
  }));
  const responses = [
    { rows: validPolicies },
    { rows: [{ scoring_policy_version: completion.REQUIRED_POLICIES[0] }] },
    { rows: [{ id: 'submission-1' }] },
    { rows: [{ overall_status: 'FAILED' }] },
  ];
  const executor = { query: async () => responses.shift() };
  const result = await completion.refreshBySubmission(executor, 'submission-1');
  assert.equal(result.status, 'FAILED');
  assert.equal(result.overallStatus, 'FAILED');
  assert.equal(result.runs.find(row => row.virtual).status, 'FAILED');
});

test('Writing repositories refresh section completion only after terminal runs', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const filename of [
    'writingQ1Q5GroupScoringRepository.js',
    'extendedWritingQuestionScoringRepository.js',
  ]) {
    const source = fs.readFileSync(path.join(
      __dirname, '../src/modules/iig-ai-scoring', filename
    ), 'utf8');
    assert.match(source, /writingCompletionRepository\.refreshByRun\(executor, runId\)/);
  }
});
