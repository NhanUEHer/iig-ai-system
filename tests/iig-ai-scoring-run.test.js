const assert = require('node:assert/strict');
const test = require('node:test');

const { buildScoringPlan, fingerprint } = require('../src/modules/iig-ai-scoring/scoringPlan');
const scoringRunRepository = require('../src/modules/iig-ai-scoring/scoringRunRepository');
const scoringRunService = require('../src/modules/iig-ai-scoring/scoringRunService');

const SUBMISSION_ID = '01a111ba-2883-78ce-98dd-335a6c85fc54';
const ATTEMPT_1 = '11a111ba-2883-78ce-98dd-335a6c85fc54';
const ATTEMPT_2 = '21a111ba-2883-78ce-98dd-335a6c85fc54';
const GROUP_ID = '31a111ba-2883-78ce-98dd-335a6c85fc54';
const RUN_ID = '41a111ba-2883-78ce-98dd-335a6c85fc54';

function readyRows() {
  return [
    {
      question_attempt_id: ATTEMPT_2,
      submission_id: SUBMISSION_ID,
      ai_input: { schemaVersion: 1, question: { number: 2 }, response: { type: 'audio' } },
      processing_version: 'iig-ai-input-v1',
      question_content_hash: 'b'.repeat(64),
      sort_order: 1,
      score_group_ids: [GROUP_ID],
    },
    {
      question_attempt_id: ATTEMPT_1,
      submission_id: SUBMISSION_ID,
      ai_input: { schemaVersion: 1, question: { number: 1 }, response: { type: 'audio' } },
      processing_version: 'iig-ai-input-v1',
      question_content_hash: 'a'.repeat(64),
      sort_order: 0,
      score_group_ids: [GROUP_ID],
    },
  ];
}

test('scoring plan is deterministic and ordered independently of database row order', () => {
  const first = buildScoringPlan(readyRows(), { policyVersion: 'rta-policy-v1' });
  const second = buildScoringPlan([...readyRows()].reverse(), { policyVersion: 'rta-policy-v1' });
  assert.equal(first.inputFingerprint, second.inputFingerprint);
  assert.equal(first.requestKey, second.requestKey);
  assert.deepEqual(first.questions.map(item => item.questionAttemptId), [ATTEMPT_1, ATTEMPT_2]);
  assert.deepEqual(first.scoreGroupIds, [GROUP_ID]);
  assert.match(first.inputFingerprint, /^[0-9a-f]{64}$/);
});

test('stable fingerprint ignores object key order but detects input changes', () => {
  assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
});

test('scoring plan rejects missing AI input and missing score groups', () => {
  const missingInput = readyRows();
  missingInput[0].ai_input = null;
  assert.throws(
    () => buildScoringPlan(missingInput, { policyVersion: 'v1' }),
    error => error.code === 'IIG_AI_INPUT_MISSING'
  );
  const missingGroups = readyRows().map(row => ({ ...row, score_group_ids: [] }));
  assert.throws(
    () => buildScoringPlan(missingGroups, { policyVersion: 'v1' }),
    error => error.code === 'IIG_AI_SCORE_GROUP_MISSING'
  );
});

test('scoring run service validates identifiers and supplies version defaults', async () => {
  const calls = [];
  const service = new scoringRunService.ScoringRunService({
    createOrReuseInitialRun: async input => {
      calls.push(input);
      return { run: { id: RUN_ID }, replayed: false };
    },
  });
  await assert.rejects(
    () => service.createInitialRun('bad-id'),
    error => error.code === 'IIG_AI_SUBMISSION_ID_INVALID'
  );
  await service.createInitialRun(SUBMISSION_ID);
  assert.equal(calls[0].policyVersion, 'iig-ai-scoring-policy-v1');
  assert.equal(calls[0].aggregationVersion, 'score-group-average-half-up-v1');

  await service.createReadAloudRun(SUBMISSION_ID);
  assert.equal(calls[1].policyVersion, 'rta-q1-q2-dify-policy-v1');
  assert.equal(calls[1].aggregationVersion, 'rta-q1-q2-group-llm-v1');
  assert.deepEqual(calls[1].scorerTypes, ['READ_TEXT_ALOUD']);
  assert.deepEqual(calls[1].questionNumbers, [1, 2]);

  await service.createDescribePictureRun(SUBMISSION_ID);
  assert.equal(calls[2].policyVersion, 'describe-picture-q3-q4-dify-policy-v1');
  assert.equal(calls[2].aggregationVersion, 'describe-picture-q3-q4-group-llm-v1');
  assert.deepEqual(calls[2].scorerTypes, ['DESCRIBE_PICTURE']);
  assert.deepEqual(calls[2].questionNumbers, [3, 4]);

  await service.createRespondQ5Q10Run(SUBMISSION_ID);
  assert.equal(calls[3].policyVersion, 'respond-q5-q10-dify-policy-v1');
  assert.equal(calls[3].aggregationVersion, 'respond-q5-q10-group-llm-v1');
  assert.deepEqual(calls[3].scorerTypes, [
    'RESPOND_TO_QUESTIONS',
    'RESPOND_USING_INFORMATION',
  ]);
  assert.deepEqual(calls[3].questionNumbers, [5, 6, 7, 8, 9, 10]);

  await service.createExpressOpinionRun(SUBMISSION_ID);
  assert.equal(calls[4].policyVersion, 'express-opinion-q11-dify-policy-v1');
  assert.equal(calls[4].aggregationVersion, 'express-opinion-q11-singleton-v1');
  assert.deepEqual(calls[4].scorerTypes, ['EXPRESS_AN_OPINION']);
  assert.deepEqual(calls[4].questionNumbers, [11]);
});

test('repository creates run, question tasks, group placeholder and outbox atomically', async () => {
  const calls = [];
  const runRow = {
    id: RUN_ID,
    submission_id: SUBMISSION_ID,
    run_number: 1,
    run_type: 'PRODUCTION',
    request_key: 'request-key',
    status: 'QUEUED',
    scoring_policy_version: 'rta-policy-v1',
    input_schema_version: 1,
    input_fingerprint: 'c'.repeat(64),
    total_questions: 2,
  };
  const responses = [
    { rows: [{ id: SUBMISSION_ID, status: 'READY_FOR_AI', ingestion_job_status: 'READY_FOR_AI' }] },
    { rows: readyRows() },
    { rows: [] },
    { rows: [{ next_run_number: 1 }] },
    { rows: [runRow] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
  ];
  const database = {
    transaction: async work => work({
      query: async (sql, params) => {
        calls.push({ sql, params });
        return responses.shift();
      },
    }),
  };
  const repository = new scoringRunRepository.ScoringRunRepository(database);
  const result = await repository.createOrReuseInitialRun({
    submissionId: SUBMISSION_ID,
    policyVersion: 'rta-policy-v1',
  });

  assert.equal(result.replayed, false);
  assert.equal(result.run.id, RUN_ID);
  assert.deepEqual(calls[1].params, [SUBMISSION_ID, null, null]);
  assert.equal(calls.filter(call => /INSERT INTO iig_ai_question_runs/.test(call.sql)).length, 2);
  assert.equal(calls.filter(call => /INSERT INTO iig_ai_group_results/.test(call.sql)).length, 1);
  assert.equal(calls.filter(call => /INSERT INTO iig_ai_scoring_outbox/.test(call.sql)).length, 1);
  assert.equal(calls.filter(call => /INSERT INTO iig_ai_scoring_events/.test(call.sql)).length, 1);
});

test('repository replays the same production request without duplicate tasks', async () => {
  const calls = [];
  const existing = {
    id: RUN_ID,
    submission_id: SUBMISSION_ID,
    run_number: 1,
    run_type: 'PRODUCTION',
    request_key: 'existing',
    status: 'QUEUED',
    scoring_policy_version: 'rta-policy-v1',
    input_schema_version: 1,
    input_fingerprint: 'c'.repeat(64),
    total_questions: 2,
  };
  const responses = [
    { rows: [{ id: SUBMISSION_ID, status: 'READY_FOR_AI', ingestion_job_status: 'READY_FOR_AI' }] },
    { rows: readyRows() },
    { rows: [existing] },
  ];
  const database = {
    transaction: async work => work({
      query: async (sql, params) => {
        calls.push({ sql, params });
        return responses.shift();
      },
    }),
  };
  const repository = new scoringRunRepository.ScoringRunRepository(database);
  const result = await repository.createOrReuseInitialRun({
    submissionId: SUBMISSION_ID,
    policyVersion: 'rta-policy-v1',
  });
  assert.equal(result.replayed, true);
  assert.equal(calls.length, 3);
});
