const test = require('node:test');
const assert = require('node:assert/strict');

const worker = require('../src/modules/iig-ai-scoring/q5Q10GroupScoringWorker');
const {
  parseQ5Q10GroupResult,
} = require('../src/modules/iig-ai-scoring/q5Q10GroupResultParser');

function componentScore(number) {
  const finalScore = number <= 6 ? 2 : 3;
  return {
    scorerType: number <= 7 ? 'RESPOND_TO_QUESTIONS' : 'RESPOND_USING_INFORMATION',
    responseProfile: number <= 6 ? 'SHORT_DIRECT_RESPONSE'
      : number === 7 ? 'EXTENDED_RESPONSE'
        : number <= 9 ? 'SHORT_INFORMATION' : 'MULTI_ITEM_INFORMATION',
    pronunciationScore: finalScore,
    intonationFluencyScore: finalScore,
    grammarScore: finalScore,
    vocabularyScore: finalScore,
    cohesionScore: finalScore,
    relevanceScore: finalScore,
    completenessScore: finalScore,
    finalScore,
  };
}

function task() {
  return {
    runId: 'run-1', groupResultId: 'group-1', scoreGroupId: 'score-group-1',
    aggregationVersion: 'respond-q5-q10-group-llm-v1', keycode: 'ABC123',
    questionScores: Object.fromEntries(
      [5, 6, 7, 8, 9, 10].map(number => [`s_q${number}`, componentScore(number)])
    ),
  };
}

test('parses the locked Q5-Q10 group result contract', () => {
  const parsed = parseQ5Q10GroupResult({
    schema_version: 'respond-q5-q10-group-result-v1',
    job_id: 'run-1', keycode: 'ABC123',
    group_code: 'RESPOND_Q5_Q10', status: 'COMPLETED',
    group_final_score: 2, applied_rules: ['Q7_Q10_WEIGHTED'],
    versions: { group_prompt_version: 'respond-q5-q10-group-prompt-v2' },
  });
  assert.equal(parsed.groupFinalScore, 2);
  assert.deepEqual(parsed.appliedRules, ['Q7_Q10_WEIGHTED']);
});

test('sends all six locked question results and persists one group decision', async () => {
  let completed = null;
  const output = await worker.processEvent({
    id: 'event-1', runId: 'run-1', payload: { groupResultId: 'group-1' },
    publishAttempts: 1, lockedBy: 'worker-1',
  }, {
    repository: {
      loadTask: async () => task(),
      startTask: async () => ({ started: true, modelExecutionId: 'execution-1' }),
      completeTask: async value => { completed = value; return { completed: true }; },
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
    endpoint: 'https://dify.example/v1', apiKey: 'secret',
    client: {
      score: async args => {
        assert.deepEqual(Object.keys(args.input.questionScores).sort(), [
          's_q10', 's_q5', 's_q6', 's_q7', 's_q8', 's_q9',
        ]);
        return {
          providerRunId: 'wf-1', workflowStatus: 'succeeded', usage: {},
          result: {
            schemaVersion: 'respond-q5-q10-group-result-v1',
            groupCode: 'RESPOND_Q5_Q10', groupFinalScore: 2,
            appliedRules: [], versions: {},
          },
        };
      },
    },
  });
  assert.equal(output.status, 'completed');
  assert.equal(output.groupFinalScore, 2);
  assert.equal(completed.modelExecutionId, 'execution-1');
});

test('retryable group failures retain the event for retry', async () => {
  let retry = null;
  const output = await worker.processEvent({
    id: 'event-1', runId: 'run-1', payload: {}, publishAttempts: 1, lockedBy: 'worker-1',
  }, {
    repository: {
      loadTask: async () => task(),
      startTask: async () => ({ started: true, modelExecutionId: 'execution-1' }),
      completeTask: async () => assert.fail('must not complete'),
      markRetry: async value => { retry = value; },
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
    endpoint: 'https://dify.example/v1', apiKey: 'secret',
    client: { score: async () => { throw Object.assign(new Error('busy'), { retryable: true }); } },
  });
  assert.equal(output.status, 'retry');
  assert.equal(retry.modelExecutionId, 'execution-1');
});
