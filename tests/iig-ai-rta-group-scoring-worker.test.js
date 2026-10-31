const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const worker = require('../src/modules/iig-ai-scoring/rtaGroupScoringWorker');

function event(overrides = {}) {
  return {
    id: 'event-1', runId: 'run-1', eventType: 'GROUP_SCORING_REQUESTED',
    payload: { groupResultId: 'group-1' }, publishAttempts: 1,
    lockedBy: 'worker-1', ...overrides,
  };
}

function task() {
  return {
    runId: 'run-1', groupResultId: 'group-1', scoreGroupId: 'score-group-1',
    aggregationVersion: 'rta-q1-q2-group-llm-v1', keycode: 'ABC123',
    questionScores: {
      s_q1: { pronunciationScore: 2, intonationStressScore: 2, finalScore: 2 },
      s_q2: { pronunciationScore: 2, intonationStressScore: 2, finalScore: 2 },
    },
  };
}

function providerResult() {
  return {
    providerRunId: 'workflow-1', taskId: 'task-1', workflowStatus: 'succeeded', usage: {},
    result: {
      schemaVersion: 'rta-group-result-v1', groupCode: 'READ_TEXT_ALOUD',
      groupFinalScore: 2, versions: { groupPrompt: 'rta-group-prompt-v1' },
    },
  };
}

test('persists the final group score after both locked question scores are ready', async () => {
  const calls = [];
  const repository = {
    loadTask: async () => task(),
    startTask: async value => { calls.push({ start: value }); return { started: true, modelExecutionId: 'execution-1' }; },
    completeTask: async value => { calls.push({ complete: value }); return { completed: true }; },
    markRetry: async value => calls.push({ retry: value }),
    markDeadLetter: async value => calls.push({ dead: value }),
  };
  const output = await worker.processEvent(event(), {
    repository, endpoint: 'https://dify.example/v1', apiKey: 'secret',
    client: { score: async () => providerResult() },
  });
  assert.equal(output.status, 'completed');
  assert.equal(output.groupFinalScore, 2);
  assert.equal(calls.some(call => call.complete), true);
});

test('backend independently enforces all 16 Q1-Q2 matrix combinations', () => {
  const expected = [
    [0, 0, 1, 1],
    [0, 1, 1, 2],
    [1, 1, 2, 2],
    [1, 2, 2, 3],
  ];
  for (let q1 = 0; q1 <= 3; q1 += 1) {
    for (let q2 = 0; q2 <= 3; q2 += 1) {
      assert.equal(worker.expectedGroupScore({
        s_q1: { finalScore: q1 }, s_q2: { finalScore: q2 },
      }), expected[q1][q2]);
    }
  }
});

test('rejects a deployed Dify flow that disagrees with the locked policy', async () => {
  const calls = [];
  const repository = {
    loadTask: async () => task(),
    startTask: async () => ({ started: true, modelExecutionId: 'execution-1' }),
    completeTask: async () => { throw new Error('must not persist'); },
    markRetry: async () => {},
    markDeadLetter: async value => calls.push(value),
  };
  const wrong = providerResult();
  wrong.result.groupFinalScore = 3;
  const output = await worker.processEvent(event(), {
    repository, endpoint: 'https://dify.example/v1', apiKey: 'secret',
    client: { score: async () => wrong },
  });
  assert.equal(output.status, 'dead_letter');
  assert.equal(output.code, 'IIG_AI_RTA_GROUP_POLICY_MISMATCH');
  assert.equal(calls.length, 1);
});

test('retryable group provider failure is scheduled', async () => {
  const calls = [];
  const repository = {
    loadTask: async () => task(),
    startTask: async () => ({ started: true, modelExecutionId: 'execution-1' }),
    completeTask: async () => {},
    markRetry: async value => calls.push(value),
    markDeadLetter: async () => {},
  };
  const output = await worker.processEvent(event(), {
    repository, endpoint: 'https://dify.example/v1', apiKey: 'secret',
    client: { score: async () => { throw Object.assign(new Error('busy'), { retryable: true }); } },
  });
  assert.equal(output.status, 'retry');
  assert.equal(calls.length, 1);
});

test('repository uses durable claiming and completes the group and run', () => {
  const source = fs.readFileSync(path.join(
    __dirname, '../src/modules/iig-ai-scoring/rtaGroupScoringRepository.js'
  ), 'utf8');
  assert.match(source, /FOR UPDATE OF event SKIP LOCKED/);
  assert.match(source, /stage, provider, model_name/);
  assert.match(source, /'GROUP_CALIBRATION'/);
  assert.match(source, /llm_group_score = \$2, final_score = \$2/);
  assert.match(source, /'GROUP_SCORING_COMPLETED'/);
  assert.match(source, /status = \$2, completed_at = CURRENT_TIMESTAMP/);
});
