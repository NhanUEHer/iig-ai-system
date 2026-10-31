const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const worker = require('../src/modules/iig-ai-scoring/writingQuestionScoringWorker');

function task(overrides = {}) {
  return {
    runId: 'run-1', questionRunId: 'question-run-1', featureSetId: 'feature-1',
    inputFingerprint: 'a'.repeat(64), scorerType: 'WRITE_SENTENCE_PICTURE',
    questionNumber: 1, keycode: 'ABC123', imageStorageProvider: 'R2',
    imageStorageBucket: 'questions', imageStorageKey: 'writing/q1.png',
    imageChecksum: 'b'.repeat(64),
    aiInput: {
      question: { questionText: 'Use the words "woman" and "table".' },
      response: { type: 'text', text: 'A woman is sitting at a table.' },
    },
    ...overrides,
  };
}

test('Writing Q1-Q5 worker sends text, picture and required words without STT', async () => {
  let completed = null;
  const result = await worker.processEvent({
    id: 'event-1', runId: 'run-1', publishAttempts: 1, lockedBy: 'worker-1', payload: {},
  }, {
    endpoint: 'https://dify.example/v1', apiKey: 'secret',
    repository: {
      loadTask: async () => task(),
      startTask: async () => ({ started: true, modelExecutionId: 'execution-1' }),
      completeTask: async args => { completed = args; return { completed: true, groupEvents: 1 }; },
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
    storage: { getSignedUrl: async reference => {
      assert.equal(reference, 'r2:writing/q1.png');
      return 'https://media.example/writing-q1.png';
    } },
    client: { score: async ({ input }) => {
      assert.equal(input.studentWriting, 'A woman is sitting at a table.');
      assert.deepEqual(input.requiredWords, ['woman', 'table']);
      assert.equal(input.pictureUrl, 'https://media.example/writing-q1.png');
      assert.equal('transcript' in input, false);
      return { providerRunId: 'wf-1', workflowStatus: 'succeeded', usage: {}, result: { questionScoreRounded: 3 } };
    } },
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.groupEvents, 1);
  assert.equal(completed.providerResult.result.questionScoreRounded, 3);
});

test('Writing Q1-Q5 worker extracts the two source phrases separated by a slash', async () => {
  let providerInput = null;
  const sourceTask = task();
  sourceTask.aiInput.question = {
    questionText: 'Directions: Write ONE sentence based on the picture. Use the TWO words or phrases under the picture.',
    promptText: 'Question 3: Write a sentence based on a picture',
    contextText: 'coffee / next to',
  };
  await worker.processEvent({
    id: 'event-2', runId: 'run-1', publishAttempts: 1, lockedBy: 'worker-1', payload: {},
  }, {
    endpoint: 'https://dify.example/v1', apiKey: 'secret',
    repository: {
      loadTask: async () => sourceTask,
      startTask: async () => ({ started: true, modelExecutionId: 'execution-2' }),
      completeTask: async () => ({ completed: true, groupEvents: 1 }),
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
    storage: { getSignedUrl: async () => 'https://media.example/writing-q3.png' },
    client: { score: async ({ input }) => {
      providerInput = input;
      return { providerRunId: 'wf-2', workflowStatus: 'succeeded', usage: {}, result: { questionScoreRounded: 3 } };
    } },
  });
  assert.deepEqual(providerInput.requiredWords, ['coffee', 'next to']);
});

test('Writing Q1-Q5 worker rejects missing required words before calling Dify', async () => {
  let providerCalled = false;
  const invalidTask = task();
  invalidTask.aiInput.question = {
    questionText: 'Write one sentence based on the picture.',
    promptText: 'Question 1',
    contextText: '',
  };
  const result = await worker.processEvent({
    id: 'event-3', runId: 'run-1', publishAttempts: 1, lockedBy: 'worker-1', payload: {},
  }, {
    endpoint: 'https://dify.example/v1', apiKey: 'secret',
    repository: {
      loadTask: async () => invalidTask,
      startTask: async () => ({ started: true, modelExecutionId: 'execution-3' }),
      completeTask: async () => assert.fail('must not complete'),
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async ({ error }) => {
        assert.equal(error.code, 'IIG_AI_WRITING_REQUIRED_WORDS_INVALID');
        return { deadLettered: true };
      },
    },
    storage: { getSignedUrl: async () => 'https://media.example/writing-q1.png' },
    client: { score: async () => { providerCalled = true; } },
  });
  assert.equal(providerCalled, false);
  assert.equal(result.status, 'dead_letter');
});

test('Writing repository is isolated to WRITE_SENTENCE_PICTURE Q1-Q5', () => {
  const source = fs.readFileSync(path.join(
    __dirname, '../src/modules/iig-ai-scoring/writingQuestionScoringRepository.js'
  ), 'utf8');
  assert.match(source, /question\.scorer_type = 'WRITE_SENTENCE_PICTURE'/);
  assert.match(source, /question\.question_number BETWEEN 1 AND 5/);
  assert.doesNotMatch(source, /iig_ai_answer_transcriptions/);
});
