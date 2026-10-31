const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const completionModule = require('../src/modules/iig-ai-scoring/scoringCompletionRepository');
const creationModule = require('../src/modules/iig-ingestion/scoringRunCreationRepository');
const { ScoringCompletionRepository, deriveScopeStatus, sectionForPolicy } = completionModule;
const { ScoringRunCreationRepository } = creationModule;

const migrationSql = fs.readFileSync(path.join(
  __dirname,
  '../src/database/migrations/144_iig_plan_driven_completion.sql'
), 'utf8');

test('migration persists a sealed plan with immutable run, question, and group counts', () => {
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS iig_ai_scoring_plans/);
  assert.match(migrationSql, /expected_run_count INTEGER NOT NULL/);
  assert.match(migrationSql, /expected_question_count INTEGER NOT NULL DEFAULT 0/);
  assert.match(migrationSql, /expected_group_count INTEGER NOT NULL DEFAULT 0/);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS scoring_plan_id UUID/);
  assert.match(migrationSql, /ROW_NUMBER\(\) OVER/);
  assert.doesNotMatch(migrationSql, /\)\s*WITH selected_runs AS/);
  assert.match(migrationSql, /ON CONFLICT \(submission_id\) DO NOTHING;/);
});

function completedScope() {
  return {
    runs: [{ id: 'run-1', status: 'COMPLETED' }],
    questions: [
      { runId: 'run-1', status: 'SCORED' },
      { runId: 'run-1', status: 'SCORED' },
    ],
    groups: [{ runId: 'run-1', status: 'COMPLETED', finalScore: 2 }],
  };
}

test('completion is derived from planned questions and groups, not fixed sections', () => {
  assert.equal(deriveScopeStatus(completedScope()), 'COMPLETED');
  assert.equal(sectionForPolicy('rta-q1-q2-dify-policy-v1'), 'SPEAKING');
  assert.equal(sectionForPolicy('opinion-essay-q8-dify-policy-v1'), 'WRITING');

  const sw = completedScope();
  sw.runs.push({ id: 'run-2', status: 'COMPLETED' });
  sw.questions.push({ runId: 'run-2', status: 'SCORED' });
  sw.groups.push({ runId: 'run-2', status: 'COMPLETED', finalScore: 3 });
  assert.equal(deriveScopeStatus(sw), 'COMPLETED');
});

test('a missing question, unfinished group, or missing final score keeps the plan processing', () => {
  const missingGroup = completedScope();
  missingGroup.groups = [];
  assert.equal(deriveScopeStatus(missingGroup), 'PROCESSING');

  const questionPending = completedScope();
  questionPending.questions[1].status = 'LLM_SCORING';
  assert.equal(deriveScopeStatus(questionPending), 'PROCESSING');

  const groupPending = completedScope();
  groupPending.groups[0].status = 'WAITING';
  assert.equal(deriveScopeStatus(groupPending), 'PROCESSING');

  const missingScore = completedScope();
  missingScore.groups[0].finalScore = null;
  assert.equal(deriveScopeStatus(missingScore), 'PROCESSING');
});

test('review and technical failures preserve terminal outcome severity', () => {
  const review = completedScope();
  review.questions[0].status = 'REVIEW_REQUIRED';
  assert.equal(deriveScopeStatus(review), 'COMPLETED_WITH_ISSUES');

  const failure = completedScope();
  failure.groups[0].status = 'FAILED';
  assert.equal(deriveScopeStatus(failure), 'FAILED');
});

test('a BUILDING plan cannot finalize even if currently materialized rows are terminal', async () => {
  const calls = [];
  const repository = new ScoringCompletionRepository();
  const executor = {
    async query(sql) {
      calls.push(sql);
      if (/FOR UPDATE/.test(sql)) return { rows: [{ id: 'submission-1' }] };
      if (/FROM iig_ai_scoring_plans/.test(sql)) {
        return { rows: [{ id: 'plan-1', status: 'BUILDING', expected_run_count: 1,
          expected_question_count: 2, expected_group_count: 1 }] };
      }
      throw new Error('No other query is allowed for an unsealed plan.');
    },
  };
  const result = await repository.refreshBySubmission(executor, 'submission-1');
  assert.equal(result.status, 'PROCESSING');
  assert.equal(calls.length, 2);
});

test('a sealed S-only plan completes the section and submission without Writing', async () => {
  const calls = [];
  const repository = new ScoringCompletionRepository();
  const executor = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/FOR UPDATE/.test(sql)) return { rows: [{ id: 'submission-1' }] };
      if (/FROM iig_ai_scoring_plans/.test(sql)) {
        return { rows: [{ id: 'plan-1', status: 'SEALED', expected_run_count: 1,
          expected_question_count: 2, expected_group_count: 1 }] };
      }
      if (/FROM iig_ai_scoring_runs WHERE scoring_plan_id/.test(sql)) {
        return { rows: [{ id: 'run-1', scoring_policy_version: 'rta-q1-q2-dify-policy-v1', status: 'COMPLETED' }] };
      }
      if (/FROM iig_ai_question_runs/.test(sql)) {
        return { rows: [
          { scoring_run_id: 'run-1', status: 'SCORED', section_type: 'SPEAKING' },
          { scoring_run_id: 'run-1', status: 'SCORED', section_type: 'SPEAKING' },
        ] };
      }
      if (/FROM iig_ai_group_results/.test(sql)) {
        return { rows: [{ scoring_run_id: 'run-1', status: 'COMPLETED', final_score: 2 }] };
      }
      if (/FROM iig_question_attempts/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
  };
  const result = await repository.refreshBySubmission(executor, 'submission-1');
  assert.equal(result.status, 'COMPLETED');
  assert.deepEqual(result.sectionStatuses, { SPEAKING: 'COMPLETED' });
  const invalidResolutionQuery = calls.find(call => /FROM iig_question_attempts/.test(call.sql));
  assert.match(invalidResolutionQuery.sql, /JOIN iig_exam_sections section ON section.id = question.section_id/);
  assert.doesNotMatch(invalidResolutionQuery.sql, /question\.section_type/);
  assert.equal(calls.some(call => call.params?.[1] === 'WRITING'), false);
  assert.equal(calls.some(call => /UPDATE iig_submissions/.test(call.sql)
    && call.params?.[1] === 'COMPLETED'), true);
});

test('startup reconciliation refreshes sealed plans still marked processing', async () => {
  const refreshed = [];
  const database = {
    async query() {
      return { rows: [{ submission_id: 'submission-1' }, { submission_id: 'submission-2' }] };
    },
    async transaction(callback) {
      const executor = {
        async query(sql, params) {
          if (/FOR UPDATE/.test(sql)) return { rows: [{ id: params[0] }] };
          if (/FROM iig_ai_scoring_plans/.test(sql)) {
            refreshed.push(params[0]);
            return { rows: [{ id: `plan-${params[0]}`, status: 'BUILDING' }] };
          }
          throw new Error('Unexpected reconciliation query.');
        },
      };
      return callback(executor);
    },
  };
  const repository = new ScoringRunCreationRepository(database);
  assert.deepEqual(await repository.reconcileSealedPlans(), {
    selected: 2,
    reconciled: 2,
    failed: 0,
    failures: [],
  });
  assert.deepEqual(refreshed, ['submission-1', 'submission-2']);
});

test('startup reconciliation isolates a failed submission and continues', async () => {
  const attempted = [];
  const database = {
    async query() {
      return { rows: [{ submission_id: 'submission-bad' }, { submission_id: 'submission-good' }] };
    },
    async transaction(callback) {
      const submissionId = attempted.length === 0 ? 'submission-bad' : 'submission-good';
      attempted.push(submissionId);
      if (submissionId === 'submission-bad') {
        const error = new Error('invalid completion projection');
        error.code = '42703';
        throw error;
      }
      return callback({
        async query(sql) {
          if (/FOR UPDATE/.test(sql)) return { rows: [{ id: submissionId }] };
          if (/FROM iig_ai_scoring_plans/.test(sql)) {
            return { rows: [{ id: 'plan-good', status: 'BUILDING' }] };
          }
          throw new Error('Unexpected reconciliation query.');
        },
      });
    },
  };
  const repository = new ScoringRunCreationRepository(database);
  assert.deepEqual(await repository.reconcileSealedPlans(), {
    selected: 2,
    reconciled: 1,
    failed: 1,
    failures: [{
      submissionId: 'submission-bad',
      code: '42703',
      message: 'invalid completion projection',
    }],
  });
  assert.deepEqual(attempted, ['submission-bad', 'submission-good']);
});
