const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const worker = require('../src/modules/iig-ai-scoring/describePictureQuestionScoringWorker');

function event(overrides = {}) {
  return {
    id: 'event-1', runId: 'run-1', eventType: 'QUESTION_SCORING_REQUESTED',
    payload: { questionRunId: 'question-run-1', featureSetId: 'feature-1' },
    publishAttempts: 1, lockedBy: 'worker-1', ...overrides,
  };
}

function task(overrides = {}) {
  return {
    runId: 'run-1', questionRunId: 'question-run-1', questionAttemptId: 'attempt-1',
    featureSetId: 'feature-1', inputFingerprint: 'a'.repeat(64),
    scorerType: 'DESCRIBE_PICTURE', questionNumber: 3,
    transcript: 'Two people are talking.', keycode: 'ABC123',
    audioStorageProvider: 'R2', audioStorageBucket: 'source-audio', audioStorageKey: 'answers/q3.mp3',
    audioChecksum: 'b'.repeat(64), imageStorageProvider: 'R2',
    imageStorageBucket: 'source-images', imageStorageKey: 'questions/q3.png', imageChecksum: 'c'.repeat(64),
    aiInput: { question: { questionText: 'Describe the picture.' } },
    ...overrides,
  };
}

function providerResult() {
  return {
    providerRunId: 'wf-1', taskId: 'task-1', workflowStatus: 'succeeded', usage: {},
    result: { questionScoreRounded: 2 },
  };
}

test('resolves both private assets and persists streamed progress', async () => {
  const references = [];
  const buckets = [];
  const progress = [];
  const repository = {
    loadTask: async () => task(),
    startTask: async () => ({ started: true, modelExecutionId: 'execution-1' }),
    recordProgress: async value => progress.push(value.progress.eventType),
    completeTask: async () => ({ completed: true, groupEvents: 1 }),
    markRetry: async () => assert.fail('must not retry'),
    markDeadLetter: async () => assert.fail('must not dead-letter'),
  };
  const output = await worker.processEvent(event(), {
    repository,
    storage: { getSignedUrl: async (reference, options) => {
      references.push(reference);
      buckets.push(options.bucket);
      return reference.includes('answers/')
        ? 'https://media.example/q3.mp3' : 'https://media.example/q3.png';
    } },
    endpoint: 'https://dify.example/v1', apiKey: 'secret',
    client: { score: async args => {
      assert.equal(args.input.questionId, 's_q3');
      assert.equal(args.input.imageUrl, 'https://media.example/q3.png');
      await args.onProgress({ eventType: 'SCORE_READY' });
      return providerResult();
    } },
  });
  assert.deepEqual(references, ['r2:answers/q3.mp3', 'r2:questions/q3.png']);
  assert.deepEqual(buckets, ['source-audio', 'source-images']);
  assert.deepEqual(progress, ['SCORE_READY']);
  assert.equal(output.groupEvents, 1);
});

test('upstream zero skips signed URL resolution', async () => {
  let signed = false;
  const repository = {
    loadTask: async () => task({ upstreamZeroReason: 'NO_SPEECH' }),
    startTask: async () => ({ started: true, modelExecutionId: 'execution-1' }),
    recordProgress: async () => {},
    completeTask: async () => ({ completed: true, groupEvents: 0 }),
    markRetry: async () => {}, markDeadLetter: async () => {},
  };
  await worker.processEvent(event(), {
    repository,
    storage: { getSignedUrl: async () => { signed = true; } },
    endpoint: 'https://dify.example/v1', apiKey: 'secret',
    client: { score: async args => {
      assert.equal(args.input.upstreamZeroReason, 'NO_SPEECH');
      assert.equal(args.input.audioUrl, null);
      return providerResult();
    } },
  });
  assert.equal(signed, false);
});

test('repository claims only DESCRIBE_PICTURE while RTA remains isolated', () => {
  const describeSource = fs.readFileSync(path.join(
    __dirname, '../src/modules/iig-ai-scoring/describePictureQuestionScoringRepository.js'
  ), 'utf8');
  const rtaSource = fs.readFileSync(path.join(
    __dirname, '../src/modules/iig-ai-scoring/rtaQuestionScoringRepository.js'
  ), 'utf8');
  assert.match(describeSource, /question\.scorer_type = 'DESCRIBE_PICTURE'/);
  assert.match(describeSource, /question\.question_number IN \(3, 4\)/);
  assert.match(describeSource, /asset\.asset_role = 'QUESTION_IMAGE'/);
  assert.match(describeSource, /'TRANSCRIBING', 'EXTRACTING_FEATURES', 'SCORING_QUESTIONS'/);
  assert.match(rtaSource, /question\.scorer_type = 'READ_TEXT_ALOUD'/);
});
