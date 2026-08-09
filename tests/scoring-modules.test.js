const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveQuestionType } = require('../src/modules/scoring/questionType');
const { findMatchingAgent, selectAgent } = require('../src/modules/scoring/agentSelector');
const { calculateSubmissionStatus } = require('../src/modules/scoring/submissionStatusService');

test('question type resolver covers all Speaking groups', () => {
  assert.equal(resolveQuestionType('Speaking', 1), 'sp_read_aloud');
  assert.equal(resolveQuestionType('Speaking', 3), 'sp_describe_pic');
  assert.equal(resolveQuestionType('Speaking', 5), 'sp_respond_q');
  assert.equal(resolveQuestionType('Speaking', 8), 'sp_respond_info');
  assert.equal(resolveQuestionType('Speaking', 11), 'sp_opinion');
});

test('question type resolver covers all Writing groups and rejects invalid input', () => {
  assert.equal(resolveQuestionType('Writing', 1), 'w_picture');
  assert.equal(resolveQuestionType('Writing', 6), 'w_email');
  assert.equal(resolveQuestionType('Writing', 8), 'w_text');
  assert.equal(resolveQuestionType('Listening', 1), null);
  assert.equal(resolveQuestionType('Speaking', 0), null);
});

test('submission status is derived consistently from answer counts', () => {
  assert.equal(calculateSubmissionStatus([{ status: 'pending', cnt: '19' }]), 1);
  assert.equal(calculateSubmissionStatus([{ status: 'scoring', cnt: '1' }]), 2);
  assert.equal(calculateSubmissionStatus([
    { status: 'scored', cnt: '5' },
    { status: 'pending', cnt: '14' }
  ]), 2);
  assert.equal(calculateSubmissionStatus([
    { status: 'scored', cnt: '18' },
    { status: 'error', cnt: '1' }
  ]), 3);
});

test('agent selector builds a deterministic Grading query', async () => {
  const gradingAgent = { id: 7, api_type: 'Grading' };
  const calls = [];
  const database = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [gradingAgent] };
    }
  };

  const result = await findMatchingAgent({
    apiType: 'Grading',
    questionType: 'w_email'
  }, database);

  assert.equal(result, gradingAgent);
  assert.deepEqual(calls[0].params, ['w_email']);
  assert.match(calls[0].sql, /ORDER BY id ASC LIMIT 1/);
});

test('compatible explicit agent selection takes precedence over automatic matching', async () => {
  const explicitAgent = { id: 12, api_type: 'STT', stt_target: 'context', target_questions: ['sp_respond_info'] };
  const database = {
    async query(sql, params) {
      assert.match(sql, /WHERE id = \$1/);
      assert.deepEqual(params, [12]);
      return { rows: [explicitAgent] };
    }
  };

  const result = await selectAgent({
    agentId: 12,
    apiType: 'STT',
    sttTarget: 'context',
    answer: { section: 'Speaking', question_no: 8 }
  }, database);

  assert.equal(result, explicitAgent);
});

test('explicit agent selection rejects an incompatible workflow', async () => {
  const database = { query: async () => ({ rows: [{ id: 12, api_type: 'Grading', target_questions: ['sp_read_aloud'] }] }) };
  const result = await selectAgent({
    agentId: 12,
    apiType: 'STT',
    sttTarget: 'context',
    answer: { section: 'Speaking', question_no: 8 }
  }, database);
  assert.equal(result, null);
});
