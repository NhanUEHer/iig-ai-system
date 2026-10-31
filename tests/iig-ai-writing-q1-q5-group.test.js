const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDifyInputs } = require('../src/clients/iigWritingQ1Q5GroupDifyClient');
const { parseWritingQ1Q5GroupResult } = require(
  '../src/modules/iig-ai-scoring/writingQ1Q5GroupResultParser'
);
const worker = require('../src/modules/iig-ai-scoring/writingQ1Q5GroupScoringWorker');

function score(value) {
  return {
    grammarScore: value, pictureRelevanceScore: value,
    requiredWordUsageScore: value, sentenceQualityScore: value, finalScore: value,
  };
}

function scores() {
  return Object.fromEntries([1, 2, 3, 4, 5].map(number => [`w_q${number}`, score(number < 3 ? 2 : 3)]));
}

test('maps exactly five locked Writing question scores', () => {
  const mapped = buildDifyInputs({ jobId: 'run-1', keycode: 'ABC123', questionScores: scores() });
  const questions = JSON.parse(mapped.questions_json);
  assert.deepEqual(questions.map(item => item.question_id), ['w_q1', 'w_q2', 'w_q3', 'w_q4', 'w_q5']);
  assert.deepEqual(questions.map(item => item.question_number), [1, 2, 3, 4, 5]);
  assert.equal(questions[0].picture_relevance_score, 2);
  assert.equal(questions[4].final_score, 3);
});

test('parses the final cloud-ready Writing group contract', () => {
  const parsed = parseWritingQ1Q5GroupResult({
    schema_version: 'write-sentence-group-result-v1', job_id: 'run-1', keycode: 'ABC123',
    group_code: 'WRITE_SENTENCE_PICTURE', status: 'COMPLETED', group_final_score: 3,
    group_raw_total: 13, group_score_max: 15, group_average: 2.6,
    question_scores: [2, 2, 3, 3, 3], applied_rules: ['GROUP_CONSISTENTLY_STRONG'],
    versions: { group_prompt_version: 'write-sentence-group-prompt-v1', group_policy_version: 'write-sentence-group-policy-v1' },
  });
  assert.equal(parsed.groupFinalScore, 3);
  assert.equal(parsed.groupRawTotal, 13);
});

test('group worker persists one five-question decision', async () => {
  let completed = null;
  const output = await worker.processEvent({
    id: 'event-1', runId: 'run-1', publishAttempts: 1, lockedBy: 'worker-1', payload: {},
  }, {
    endpoint: 'https://dify.example/v1', apiKey: 'secret',
    repository: {
      loadTask: async () => ({ runId: 'run-1', groupResultId: 'group-1', keycode: 'ABC123', aggregationVersion: 'write-sentence-q1-q5-group-llm-v1', questionScores: scores() }),
      startTask: async () => ({ started: true, modelExecutionId: 'execution-1' }),
      completeTask: async args => { completed = args; return { completed: true }; },
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
    client: { score: async ({ input }) => {
      assert.deepEqual(Object.keys(input.questionScores), ['w_q1', 'w_q2', 'w_q3', 'w_q4', 'w_q5']);
      return { providerRunId: 'wf-1', workflowStatus: 'succeeded', usage: {}, result: { schemaVersion: 'write-sentence-group-result-v1', groupFinalScore: 3 } };
    } },
  });
  assert.equal(output.groupFinalScore, 3);
  assert.equal(completed.providerResult.result.groupFinalScore, 3);
});
