const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDifyInputs,
  createIigRtaGroupDifyClient,
} = require('../src/clients/iigRtaGroupDifyClient');

function input() {
  return {
    jobId: 'run-1',
    keycode: 'abc123',
    questionScores: {
      s_q1: { pronunciationScore: 2, intonationStressScore: 2, finalScore: 2 },
      s_q2: { pronunciationScore: 3, intonationStressScore: 2, finalScore: 2 },
    },
  };
}

test('maps locked Q1-Q2 scores to the Dify group transport contract', () => {
  const mapped = buildDifyInputs(input());
  assert.equal(mapped.schema_version, 'rta-group-input-v1');
  assert.equal(mapped.keycode, 'ABC123');
  assert.deepEqual(JSON.parse(mapped.questions_json), [
    {
      question_id: 's_q1', pronunciation_score: 2,
      intonation_stress_score: 2, final_score: 2,
    },
    {
      question_id: 's_q2', pronunciation_score: 3,
      intonation_stress_score: 2, final_score: 2,
    },
  ]);
});

test('calls the blocking Dify workflow and parses its result', async () => {
  const calls = [];
  const client = createIigRtaGroupDifyClient({
    httpClient: {
      post: async (...args) => {
        calls.push(args);
        return {
          data: {
            task_id: 'task-1',
            data: {
              id: 'workflow-1', status: 'succeeded', elapsed_time: 0.5,
              outputs: {
                result_json: JSON.stringify({
                  schema_version: 'rta-group-result-v1',
                  job_id: 'run-1', keycode: 'ABC123',
                  group_code: 'READ_TEXT_ALOUD', group_final_score: 2,
                  group_score_rationale: 'Both question scores support band 2.',
                  versions: { group_prompt: 'rta-group-prompt-v1' },
                }),
              },
              total_tokens: 30,
            },
          },
        };
      },
    },
  });
  const output = await client.score({
    endpoint: 'https://dify.example/v1', apiKey: 'secret', input: input(), requestId: 'exec-1',
  });
  assert.equal(calls[0][1].response_mode, 'blocking');
  assert.equal(output.result.groupFinalScore, 2);
  assert.equal(output.providerRunId, 'workflow-1');
});

test('rejects an incomplete Q1-Q2 group before calling Dify', () => {
  assert.throws(() => buildDifyInputs({
    ...input(), questionScores: { s_q1: input().questionScores.s_q1 },
  }));
});
