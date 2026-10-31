const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const worker = require('../src/modules/iig-ai-scoring/extendedSpeakingQuestionScoringWorker');

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
    scorerType: 'RESPOND_TO_QUESTIONS', questionNumber: 7,
    transcript: 'I exercise three times a week because it helps me stay healthy.',
    keycode: 'ABC123',
    audioStorageProvider: 'R2', audioStorageBucket: 'source-audio',
    audioStorageKey: 'answers/q7.mp3', audioChecksum: 'b'.repeat(64),
    contextImageStorageProvider: null, contextImageStorageBucket: null,
    contextImageStorageKey: null, contextImageChecksum: null,
    features: { common: { response: { durationSeconds: 19.2, wordCount: 12 } } },
    aiInput: {
      question: {
        questionText: 'How often do you exercise and why?',
        promptText: 'Answer the question.', contextText: null,
      },
    },
    ...overrides,
  };
}

function providerResult(score = 2) {
  return {
    providerRunId: 'wf-1', taskId: 'task-1', workflowStatus: 'succeeded', usage: {},
    result: { questionScoreRounded: score },
  };
}

test('routes Q7 to its Dify profile, streams progress, and persists the result', async () => {
  const progress = [];
  let completed = null;
  const result = await worker.processEvent(event(), {
    repository: {
      loadTask: async () => task(),
      startTask: async () => ({ started: true, modelExecutionId: 'execution-1' }),
      recordProgress: async value => progress.push(value.progress.eventType),
      completeTask: async value => { completed = value; return { completed: true, groupEvents: 0 }; },
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
    storage: {
      getSignedUrl: async reference => {
        assert.equal(reference, 'r2:answers/q7.mp3');
        return 'https://media.example/q7.mp3';
      },
    },
    profiles: {
      RESPOND_TO_QUESTIONS: {
        endpoint: 'https://dify.example/v1', apiKey: 'secret',
        modelName: 'test-model', modelVersion: 'test-model-v1',
      },
    },
    client: {
      score: async args => {
        assert.equal(args.input.scorerType, 'RESPOND_TO_QUESTIONS');
        assert.equal(args.input.questionNumber, 7);
        assert.equal(args.input.responseProfile, 'EXTENDED_RESPONSE');
        assert.equal(args.input.audioDurationSeconds, 19.2);
        await args.onProgress({ eventType: 'SCORE_READY' });
        await args.onProgress({ eventType: 'ERRORS_READY' });
        return providerResult();
      },
    },
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.questionScore, 2);
  assert.deepEqual(progress, ['SCORE_READY', 'ERRORS_READY']);
  assert.equal(completed.modelExecutionId, 'execution-1');
});

test('routes Q10 with its information context image to a separate Dify profile', async () => {
  const references = [];
  const result = await worker.processEvent(event(), {
    repository: {
      loadTask: async () => task({
        scorerType: 'RESPOND_USING_INFORMATION', questionNumber: 10,
        aiInput: { question: { questionText: 'Which two sessions are before lunch?' } },
        contextImageStorageProvider: 'R2', contextImageStorageBucket: 'source-context',
        contextImageStorageKey: 'questions/schedule.png', contextImageChecksum: 'c'.repeat(64),
      }),
      startTask: async () => ({ started: true, modelExecutionId: 'execution-2' }),
      recordProgress: async () => {},
      completeTask: async () => ({ completed: true, groupEvents: 1 }),
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
    storage: {
      getSignedUrl: async reference => {
        references.push(reference);
        return reference.includes('schedule')
          ? 'https://media.example/schedule.png' : 'https://media.example/q10.mp3';
      },
    },
    profiles: {
      RESPOND_USING_INFORMATION: {
        endpoint: 'https://dify.example/v1', apiKey: 'secret',
        modelName: 'test-model', modelVersion: 'test-model-v1',
      },
    },
    client: {
      score: async args => {
        assert.equal(args.input.scorerType, 'RESPOND_USING_INFORMATION');
        assert.equal(args.input.responseProfile, 'MULTI_ITEM_INFORMATION');
        assert.equal(args.input.contextImageUrl, 'https://media.example/schedule.png');
        return providerResult(3);
      },
    },
  });
  assert.deepEqual(references, ['r2:answers/q7.mp3', 'r2:questions/schedule.png']);
  assert.equal(result.groupEvents, 1);
});

test('extended speaking worker and repository stay isolated from Q1-Q4', () => {
  const repositorySource = fs.readFileSync(path.join(
    __dirname, '../src/modules/iig-ai-scoring/extendedSpeakingQuestionScoringRepository.js'
  ), 'utf8');
  assert.match(repositorySource, /RESPOND_TO_QUESTIONS/);
  assert.match(repositorySource, /RESPOND_USING_INFORMATION/);
  assert.match(repositorySource, /question\.question_number BETWEEN 5 AND 10/);
  assert.doesNotMatch(repositorySource, /READ_TEXT_ALOUD/);
  assert.doesNotMatch(repositorySource, /DESCRIBE_PICTURE/);
});
