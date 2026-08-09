const assert = require('node:assert/strict');
const test = require('node:test');

const gradeAnswer = require('../src/modules/scoring/gradeAnswer');

function dependencies(overrides = {}) {
  const statuses = [];
  const evaluations = [];
  const refreshed = [];
  return {
    statuses,
    evaluations,
    refreshed,
    value: {
      submissions: {
        findAnswerById: async () => ({
          id: 'answer-1', submission_id: 'submission-1', section: 'Writing',
          student_writing: 'Essay', prompt_text: 'Prompt', question_no: 1
        }),
        updateAnswerStatus: async (id, status) => statuses.push([id, status])
      },
      evaluations: { upsertEvaluation: async value => evaluations.push(value) },
      selectAgent: async () => ({ api_endpoint: 'https://agent', api_key: 'secret' }),
      refreshSubmissionStatus: async id => refreshed.push(id),
      dify: { evaluateWriting: async () => ({ data: { outputs: { final_score: 7 } } }) },
      now: (() => {
        const dates = [new Date('2026-01-01'), new Date('2026-01-02')];
        return () => dates.shift();
      })(),
      ...overrides
    }
  };
}

test('gradeAnswer grades Writing and persists the normalized evaluation', async () => {
  const state = dependencies();
  const result = await gradeAnswer({ answerId: 'answer-1' }, state.value);

  assert.equal(result.finalScore, 7);
  assert.deepEqual(state.statuses, [['answer-1', 'scoring'], ['answer-1', 'scored']]);
  assert.deepEqual(state.refreshed, ['submission-1', 'submission-1']);
  assert.equal(state.evaluations[0].answerId, 'answer-1');
  assert.equal(state.evaluations[0].finalScore, 7);
});

test('gradeAnswer passes prepared Speaking input to the speech agent', async () => {
  let speechArguments;
  const state = dependencies({
    submissions: {
      findAnswerById: async () => ({
        id: 'answer-2', submission_id: 'submission-2', section: 'Speaking',
        prompt_text: 'Prompt', image_url: 'image', question_no: 1
      }),
      updateAnswerStatus: async (id, status) => state.statuses.push([id, status])
    },
    prepareSpeakingGradingInput: async () => ({
      audioUrl: 'https://audio', transcription: 'Student', contextText: 'Context', questionName: 'Question'
    }),
    dify: {
      evaluateSpeech: async (...args) => {
        speechArguments = args;
        return { data: { outputs: { final_score: 5 } } };
      }
    }
  });

  await gradeAnswer({ answerId: 'answer-2' }, state.value);
  assert.deepEqual(speechArguments.slice(2), [
    'https://audio', 'Prompt', 'Student', 'image', 'Context', 'Question'
  ]);
});

test('gradeAnswer marks an existing answer as error when evaluation fails', async () => {
  const state = dependencies({
    dify: { evaluateWriting: async () => { throw new Error('Agent unavailable'); } }
  });

  await assert.rejects(() => gradeAnswer({ answerId: 'answer-1' }, state.value), /Agent unavailable/);
  assert.deepEqual(state.statuses, [['answer-1', 'scoring'], ['answer-1', 'error']]);
  assert.deepEqual(state.refreshed, ['submission-1', 'submission-1']);
});

test('gradeAnswer validates input without writing an error status', async () => {
  const state = dependencies();
  await assert.rejects(() => gradeAnswer({}, state.value), error => error.statusCode === 400);
  assert.deepEqual(state.statuses, []);
});

test('gradeAnswer rejects concurrent scoring without changing its status', async () => {
  const state = dependencies({
    submissions: {
      findAnswerById: async () => ({ id: 'answer-1', submission_id: 'submission-1', section: 'Writing' }),
      tryStartScoring: async () => false,
      updateAnswerStatus: async (id, status) => state.statuses.push([id, status])
    }
  });

  await assert.rejects(
    () => gradeAnswer({ answerId: 'answer-1' }, state.value),
    error => error.statusCode === 409
  );
  assert.deepEqual(state.statuses, []);
});
