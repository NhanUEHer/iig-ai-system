const test = require('node:test');
const assert = require('node:assert/strict');
const { JobDetailService } = require('../src/modules/ai-scoring-jobs/jobDetailService');
const { JobDetailRepository } = require('../src/modules/ai-scoring-jobs/jobDetailRepository');
const { JobPipelineService } = require('../src/modules/ai-scoring-jobs/jobPipelineService');
const { JobPipelineRepository } = require('../src/modules/ai-scoring-jobs/jobPipelineRepository');

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const CHILD_ID = '22222222-2222-4222-8222-222222222222';

test('detail service rejects invalid identifiers before querying', async () => {
  const service = new JobDetailService({ overview: async () => { throw new Error('must not query'); } });
  await assert.rejects(() => service.overview('bad-id'), error => error.code === 'INVALID_ID');
});

test('result is unavailable for a non-terminal run', async () => {
  const service = new JobDetailService({ overview: async () => ({ run_status: 'SCORING_QUESTIONS' }) });
  await assert.rejects(() => service.result(JOB_ID), error => error.statusCode === 409 && error.code === 'RESULT_NOT_READY');
});

test('result maps canonical group and question ids for the selected run', async () => {
  const service = new JobDetailService({
    overview: async () => ({ run_status: 'COMPLETED' }),
    plan: async () => ({ run: { id: CHILD_ID }, groups: [{ source_group_id: 'GROUP-1', applied_question_ids: ['Q1','Q2'], final_score: '3.5', aggregation_version: 'v1', decision_code: 'LLM' }] }),
    questions: async () => [{ source_question_id: 'Q1', llm_score: '3.0', error_code: null }],
  });
  const result = await service.result(JOB_ID, CHILD_ID);
  assert.equal(result.runId, CHILD_ID);
  assert.deepEqual(result.scores[0].appliedQuestionIds, ['Q1','Q2']);
  assert.equal(result.details[0].questionId, 'Q1');
});

test('model lineage query exposes only redacted investigation metadata', async () => {
  let sql = '';
  const repository = new JobDetailRepository({ query: async statement => { sql = statement; return { rows: [] }; } });
  await repository.modelExecutions(JOB_ID);
  assert.match(sql, /provider/);
  assert.match(sql, /prompt_version/);
  assert.doesNotMatch(sql, /raw_output/);
  assert.doesNotMatch(sql, /estimated_cost_usd/);
  assert.doesNotMatch(sql, /provider_request_id/);
});

test('question detail query is bounded by job and canonical question id', async () => {
  let values;
  const repository = new JobDetailRepository({ query: async (_sql, params) => { values = params; return { rows: [] }; } });
  await repository.question(JOB_ID, CHILD_ID);
  assert.deepEqual(values, [JOB_ID, CHILD_ID]);
});

test('plan groups are bounded to the latest selected run', async () => {
  const calls = [];
  const repository = new JobDetailRepository({ query: async (sql, values) => {
    calls.push({ sql, values });
    return calls.length === 1 ? { rows: [{ id: CHILD_ID, run_number: 2 }] } : { rows: [] };
  } });
  await repository.plan(JOB_ID);
  assert.deepEqual(calls[0].values, [JOB_ID]);
  assert.deepEqual(calls[1].values, [CHILD_ID]);
  assert.match(calls[1].sql, /gr\.scoring_run_id=\$1/);
});

test('pipeline exposes durable work state and redacts unknown payload fields', async () => {
  const service = new JobPipelineService({ workItems: async () => ({
    ingestion: [],
    scoring: [{
      id: CHILD_ID, event_type: 'QUESTION_SCORING_REQUESTED', status: 'DEAD_LETTER', publish_attempts: 3,
      payload: { questionRunId: CHILD_ID, scorerType: 'SPEAKING', transcript: 'private answer', apiKey: 'secret' },
      run_id: CHILD_ID, run_number: 2, run_status: 'SCORING_QUESTIONS', question_status: 'FAILED',
      question_error_code: 'MODEL_TIMEOUT', question_error_message: 'Provider timeout', last_error: 'Provider timeout',
    }],
  }) });
  const result = await service.pipeline(JOB_ID, CHILD_ID, ['ai_scoring.operations.retry']);
  assert.equal(result.summary.error, 1);
  assert.equal(result.currentStepId, `scoring:${CHILD_ID}`);
  assert.equal(result.steps[0].retry.available, true);
  assert.deepEqual(result.steps[0].input, { questionRunId: CHILD_ID, scorerType: 'SPEAKING' });
  assert.equal(JSON.stringify(result).includes('private answer'), false);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('pipeline repository bounds work items to job and selected run without raw model output', async () => {
  const calls = [];
  const repository = new JobPipelineRepository({ query: async (sql, values) => { calls.push({ sql, values }); return { rows: [] }; } });
  await repository.workItems(JOB_ID, CHILD_ID);
  assert.deepEqual(calls[0].values, [JOB_ID]);
  assert.deepEqual(calls[1].values, [JOB_ID, CHILD_ID]);
  assert.match(calls[1].sql, /s\.scoring_job_id=\$1/);
  assert.match(calls[1].sql, /r\.id=\$2/);
  assert.doesNotMatch(calls[1].sql, /raw_output|prompt_text|api_key/i);
});
