const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const worker = require('../src/modules/iig-ai-scoring/expressOpinionQuestionScoringWorker');

function event() {
  return {
    id: 'event-1', runId: 'run-1', eventType: 'QUESTION_SCORING_REQUESTED',
    payload: { questionRunId: 'question-run-1', featureSetId: 'feature-1' },
    publishAttempts: 1, lockedBy: 'worker-1',
  };
}

function task() {
  return {
    runId: 'run-1', questionRunId: 'question-run-1', questionAttemptId: 'attempt-1',
    featureSetId: 'feature-1', inputFingerprint: 'a'.repeat(64),
    scorerType: 'EXPRESS_AN_OPINION', questionNumber: 11,
    transcript: 'I support remote work because it saves time and improves concentration.',
    keycode: 'ABC123', audioStorageProvider: 'R2', audioStorageBucket: 'source-audio',
    audioStorageKey: 'answers/q11.mp3', audioChecksum: 'b'.repeat(64),
    features: { common: { response: { durationSeconds: 51, wordCount: 11 } } },
    aiInput: { question: { questionText: 'Should companies allow remote work?', promptText: '' } },
  };
}

test('routes only Q11 and persists the holistic final score', async () => {
  let completed;
  const output = await worker.processEvent(event(), {
    repository: {
      loadTask: async () => task(),
      startTask: async () => ({ started: true, modelExecutionId: 'execution-1' }),
      recordProgress: async () => true,
      completeTask: async value => { completed = value; return { completed: true, groupResults: 1 }; },
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
    storage: {
      getSignedUrl: async reference => {
        assert.equal(reference, 'r2:answers/q11.mp3');
        return 'https://media.example/q11.mp3';
      },
    },
    endpoint: 'https://dify.example/v1', apiKey: 'secret',
    modelName: 'test-model', modelVersion: 'test-model-v1',
    client: {
      score: async args => {
        assert.equal(args.input.questionNumber, 11);
        assert.equal(args.input.responseProfile, 'EXTENDED_OPINION');
        assert.equal(args.input.audioDurationSeconds, 51);
        return {
          providerRunId: 'wf-1', workflowStatus: 'succeeded', usage: {},
          result: { questionScoreFinal: 4 },
        };
      },
    },
  });
  assert.equal(output.questionScore, 4);
  assert.equal(output.groupResults, 1);
  assert.equal(completed.modelExecutionId, 'execution-1');
});

test('Q11 repository stays isolated from Q1-Q10 scorer types', () => {
  const source = fs.readFileSync(path.join(
    __dirname, '../src/modules/iig-ai-scoring/expressOpinionQuestionScoringRepository.js'
  ), 'utf8');
  assert.match(source, /PROFILE\.scorerType/);
  assert.match(source, /question\.question_number = 11/);
  assert.doesNotMatch(source, /READ_TEXT_ALOUD/);
  assert.doesNotMatch(source, /RESPOND_TO_QUESTIONS/);
});
