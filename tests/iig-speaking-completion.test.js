const assert = require('node:assert/strict');
const test = require('node:test');

const completion = require('../src/modules/iig-ai-scoring/speakingCompletionRepository');

test('Speaking remains processing until all four isolated runs are terminal', () => {
  assert.equal(completion.deriveSpeakingStatus([]), 'PROCESSING');
  assert.equal(completion.deriveSpeakingStatus([
    { status: 'COMPLETED' },
    { status: 'COMPLETED' },
    { status: 'COMPLETED' },
  ]), 'PROCESSING');
  assert.equal(completion.deriveSpeakingStatus([
    ...completion.REQUIRED_POLICIES.slice(0, 3).map(scoring_policy_version => ({
      scoring_policy_version,
      status: 'COMPLETED',
    })),
    {
      scoring_policy_version: completion.REQUIRED_POLICIES[3],
      status: 'AGGREGATING_GROUPS',
    },
  ]), 'PROCESSING');
});

test('Speaking completes only when all four isolated runs complete successfully', () => {
  const rows = completion.REQUIRED_POLICIES.map(scoringPolicyVersion => ({
    scoring_policy_version: scoringPolicyVersion,
    status: 'COMPLETED',
  }));
  assert.equal(completion.deriveSpeakingStatus(rows), 'COMPLETED');
});

test('terminal technical failures fail Speaking', () => {
  const rows = completion.REQUIRED_POLICIES.map((scoringPolicyVersion, index) => ({
    scoring_policy_version: scoringPolicyVersion,
    status: index === 2 ? 'FAILED' : 'COMPLETED',
  }));
  assert.equal(completion.deriveSpeakingStatus(rows), 'FAILED');
});

test('review outcomes complete Speaking with issues', () => {
  const rows = completion.REQUIRED_POLICIES.map((scoringPolicyVersion, index) => ({
    scoring_policy_version: scoringPolicyVersion,
    status: index === 2 ? 'REVIEW_REQUIRED' : 'COMPLETED',
  }));
  assert.equal(completion.deriveSpeakingStatus(rows), 'COMPLETED_WITH_ISSUES');
});

test('completion repository persists the derived submission status', async () => {
  const calls = [];
  const rows = completion.REQUIRED_POLICIES.map(scoringPolicyVersion => ({
    scoring_policy_version: scoringPolicyVersion,
    status: 'COMPLETED',
    run_number: 1,
  }));
  const responses = [
    { rows: [{ submission_id: 'submission-1' }] },
    { rows },
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
  assert.deepEqual(calls[4].params, ['submission-1', 'SPEAKING', 'COMPLETED']);
  assert.match(calls[4].sql, /iig_ai_section_statuses/);
  assert.match(calls[4].sql, /ai_scoring_completed_at/);
});

test('invalid prompt source acts as a terminal failed Speaking policy', async () => {
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

test('Speaking completion delegates persistence to the shared section hierarchy', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(
    __dirname, '../src/modules/iig-ai-scoring/speakingCompletionRepository.js'
  ), 'utf8');
  assert.match(source, /sectionCompletionRepository\.persistStatus/);
  assert.match(source, /'SPEAKING'/);
});
