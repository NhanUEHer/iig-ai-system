const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const worker = require('../src/modules/iig-ai-scoring/extendedWritingQuestionScoringWorker');
const repository = require(
  '../src/modules/iig-ai-scoring/extendedWritingQuestionScoringRepository'
);

function task(overrides = {}) {
  return {
    runId: 'run-1',
    questionRunId: 'question-run-1',
    questionAttemptId: 'attempt-1',
    featureSetId: 'feature-1',
    inputFingerprint: 'a'.repeat(64),
    scorerType: 'RESPOND_TO_WRITTEN_REQUEST',
    questionNumber: 6,
    keycode: 'ABC123',
    aiInput: {
      question: {
        questionText: 'Reply to the customer and propose two solutions.',
        contextText: 'A customer asks about a delayed shipment.',
      },
      response: {
        type: 'text',
        text: 'Dear Customer, I apologize for the delay and can offer a refund or replacement.',
      },
    },
    ...overrides,
  };
}

function event(overrides = {}) {
  return {
    id: 'event-1', runId: 'run-1', publishAttempts: 1,
    lockedBy: 'worker-1', payload: {}, ...overrides,
  };
}

test('extended Writing worker scores text-context Q6 without image, audio or STT', async () => {
  let providerInput;
  let completed;
  const result = await worker.processEvent(event(), {
    endpoint: 'https://dify.example/v1',
    apiKey: 'secret',
    repository: {
      loadTask: async () => task(),
      startTask: async () => ({ started: true, modelExecutionId: 'execution-1' }),
      completeTask: async args => {
        completed = args;
        return { completed: true, groupResults: 1 };
      },
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
    client: {
      score: async ({ input }) => {
        providerInput = input;
        return {
          providerRunId: 'wf-1', workflowStatus: 'succeeded', usage: {},
          result: { questionScoreRounded: 4 },
        };
      },
    },
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.groupResults, 1);
  assert.equal(providerInput.scorerType, 'RESPOND_TO_WRITTEN_REQUEST');
  assert.equal(providerInput.questionNumber, 6);
  assert.equal(providerInput.contextMode, 'TEXT');
  assert.equal(providerInput.contextImageUrl, null);
  assert.deepEqual(providerInput.requiredWords, []);
  assert.equal('pictureUrl' in providerInput, false);
  assert.equal('audioUrl' in providerInput, false);
  assert.equal('transcript' in providerInput, false);
  assert.equal(completed.providerResult.result.questionScoreRounded, 4);
});

test('extended Writing worker prefers a prepared context image for Q6-Q7', async () => {
  let providerInput;
  let signedReference;
  const imageTask = task({
    contextImageStorageProvider: 'R2',
    contextImageStorageBucket: 'private-media',
    contextImageStorageKey: 'iig/context/email.png',
    contextImageChecksum: 'b'.repeat(64),
    aiInput: {
      question: {
        questionText: 'Reply to the email and ask two questions.',
        contextText: '',
      },
      response: { type: 'text', text: 'Dear Ms. Lee, could we meet on Monday or Tuesday?' },
    },
  });
  const result = await worker.processEvent(event(), {
    endpoint: 'https://dify.example/v1',
    apiKey: 'secret',
    repository: {
      loadTask: async () => imageTask,
      startTask: async () => ({ started: true, modelExecutionId: 'execution-image' }),
      completeTask: async () => ({ completed: true, groupResults: 1 }),
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
    storage: {
      getSignedUrl: async reference => {
        signedReference = reference;
        return 'https://media.example/context-email.png?signature=redacted';
      },
    },
    client: {
      score: async ({ input }) => {
        providerInput = input;
        return {
          providerRunId: 'wf-image', workflowStatus: 'succeeded', usage: {},
          result: { questionScoreRounded: 4 },
        };
      },
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(signedReference, 'r2:iig/context/email.png');
  assert.equal(providerInput.contextMode, 'IMAGE');
  assert.match(providerInput.contextImageUrl, /^https:\/\/media\.example\//);
  assert.equal(providerInput.contextText, '');
});

test('extended Writing worker selects the Q8 profile and allows business zero', async () => {
  let providerInput;
  const q8 = task({
    scorerType: 'WRITE_OPINION_ESSAY',
    questionNumber: 8,
    upstreamZeroReason: 'BLANK_RESPONSE',
    aiInput: {
      question: { contextText: 'Should companies allow remote work?' },
      response: { type: 'text', text: '' },
    },
  });
  const result = await worker.processEvent(event(), {
    endpoint: 'https://dify.example/v1',
    apiKey: 'secret',
    repository: {
      loadTask: async () => q8,
      startTask: async () => ({ started: true, modelExecutionId: 'execution-2' }),
      completeTask: async () => ({ completed: true, groupResults: 1 }),
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
    client: {
      score: async ({ input }) => {
        providerInput = input;
        return {
          providerRunId: 'wf-2', workflowStatus: 'succeeded', usage: {},
          result: { questionScoreRounded: 0 },
        };
      },
    },
  });
  assert.equal(result.status, 'completed');
  assert.equal(providerInput.scorerType, 'WRITE_OPINION_ESSAY');
  assert.equal(providerInput.upstreamZeroReason, 'BLANK_RESPONSE');
  assert.equal(providerInput.studentWriting, '');
});

test('extended Writing worker rejects Q1-Q5 before calling Dify', async () => {
  let called = false;
  let deadLetter;
  const result = await worker.processEvent(event(), {
    endpoint: 'https://dify.example/v1',
    apiKey: 'secret',
    repository: {
      loadTask: async () => task({
        scorerType: 'WRITE_SENTENCE_PICTURE',
        questionNumber: 1,
      }),
      startTask: async () => assert.fail('must not start'),
      completeTask: async () => assert.fail('must not complete'),
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async input => { deadLetter = input; },
    },
    client: { score: async () => { called = true; } },
  });
  assert.equal(result.status, 'dead_letter');
  assert.equal(called, false);
  assert.equal(deadLetter.error.code, 'IIG_AI_EXTENDED_WRITING_PROFILE_INVALID');
});

test('extended Writing repository is isolated and uses singleton group completion', () => {
  const source = fs.readFileSync(path.join(
    __dirname,
    '../src/modules/iig-ai-scoring/extendedWritingQuestionScoringRepository.js'
  ), 'utf8');
  assert.match(source, /RESPOND_TO_WRITTEN_REQUEST/);
  assert.match(source, /WRITE_OPINION_ESSAY/);
  assert.match(source, /asset\.asset_role = 'CONTEXT_IMAGE'/);
  assert.match(source, /context_image_checksum/);
  assert.match(source, /SINGLE_QUESTION_SCORE/);
  assert.doesNotMatch(source, /GROUP_SCORING_REQUESTED/);
  assert.equal(
    repository.aggregationVersionPrefixFor('RESPOND_TO_WRITTEN_REQUEST'),
    'written-request-q6-q7-singleton-'
  );
  assert.equal(
    repository.aggregationVersionPrefixFor('WRITE_OPINION_ESSAY'),
    'opinion-essay-q8-singleton-'
  );
});
