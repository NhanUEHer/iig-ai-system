const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const worker = require('../src/modules/iig-ai-scoring/rtaQuestionScoringWorker');

function event(overrides = {}) {
  return {
    id: 'event-1', runId: 'run-1', eventType: 'QUESTION_SCORING_REQUESTED',
    payload: { questionRunId: 'question-run-1', featureSetId: 'feature-1' },
    publishAttempts: 1, lockedBy: 'worker-1', ...overrides,
  };
}

function task() {
  return {
    runId: 'run-1', questionRunId: 'question-run-1', questionAttemptId: 'attempt-1',
    featureSetId: 'feature-1', inputFingerprint: 'a'.repeat(64),
    scorerType: 'READ_TEXT_ALOUD', questionNumber: 1,
    transcript: 'Good evening everyone.', keycode: 'ABC123',
    storageProvider: 'R2', storageBucket: 'iig-ai-dev',
    storageKey: 'answers/q1.mp3', audioChecksum: 'b'.repeat(64),
    aiInput: { question: { contextText: 'Good evening everyone.' } },
  };
}

function result() {
  return {
    providerRunId: 'wf-1', taskId: 'task-1', workflowStatus: 'succeeded', usage: {},
    result: {
      schemaVersion: 'rta-question-result-v1', pronunciationScore: 3,
      intonationStressScore: 2, questionScoreRaw: 2.5, questionScoreRounded: 3,
      zeroReason: null, ruleSignals: {}, errors: [],
      comment: { strength: 'A', improvement: 'B', action: 'C', text: 'A B C' }, versions: {},
    },
  };
}

test('worker streams progress, persists final result and exposes group fan-out', async () => {
  const calls = [];
  const repository = {
    loadTask: async () => task(),
    startTask: async () => ({ started: true, modelExecutionId: 'execution-1' }),
    recordProgress: async value => calls.push({ progress: value.progress.eventType }),
    completeTask: async value => { calls.push({ complete: value }); return { completed: true, groupEvents: 1 }; },
    markRetry: async value => calls.push({ retry: value }),
    markDeadLetter: async value => calls.push({ dead: value }),
  };
  const output = await worker.processEvent(event(), {
    repository,
    storage: {
      getSignedUrl: async (reference, options) => {
        calls.push({ storage: { reference, options } });
        return 'https://media.example/q1.mp3';
      },
    },
    endpoint: 'https://dify.example/v1', apiKey: 'secret',
    client: { score: async args => { await args.onProgress({ eventType: 'SCORE_READY' }); return result(); } },
  });
  assert.equal(output.status, 'completed');
  assert.equal(output.questionScore, 3);
  assert.equal(output.groupEvents, 1);
  assert.deepEqual(calls[0], {
    storage: { reference: 'r2:answers/q1.mp3', options: { bucket: 'iig-ai-dev' } },
  });
  assert.deepEqual(calls[1], { progress: 'SCORE_READY' });
});

test('upstream business zero skips audio resolution and still persists Dify hard feedback', async () => {
  const zeroTask = {
    ...task(),
    transcript: null,
    storageProvider: null,
    storageKey: null,
    audioChecksum: null,
    upstreamZeroReason: 'NO_SPEECH',
  };
  const zeroResult = result();
  zeroResult.result = {
    ...zeroResult.result,
    pronunciationScore: 0,
    intonationStressScore: 0,
    questionScoreRaw: 0,
    questionScoreRounded: 0,
    zeroReason: 'NO_SPEECH',
    errors: [{ errorType: 'NO_RESPONSE', severity: 'CRITICAL', count: 1 }],
    comment: {
      strength: 'Chưa có đủ nội dung để xác định điểm mạnh.',
      improvement: 'Không phát hiện phần trả lời có thể chấm điểm.',
      action: 'Hãy kiểm tra micro và trả lời đầy đủ.',
      text: 'Chưa có đủ nội dung để xác định điểm mạnh. Không phát hiện phần trả lời có thể chấm điểm. Hãy kiểm tra micro và trả lời đầy đủ.',
    },
  };
  let storageCalled = false;
  let persisted = null;
  const output = await worker.processEvent(event(), {
    repository: {
      loadTask: async () => zeroTask,
      startTask: async () => ({ started: true, modelExecutionId: 'execution-zero' }),
      recordProgress: async () => {},
      completeTask: async value => { persisted = value; return { completed: true, groupEvents: 1 }; },
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
    storage: {
      getSignedUrl: async () => { storageCalled = true; return null; },
    },
    endpoint: 'https://dify.example/v1',
    apiKey: 'secret',
    client: {
      score: async ({ input }) => {
        assert.equal(input.upstreamZeroReason, 'NO_SPEECH');
        assert.equal(input.audioUrl, null);
        return zeroResult;
      },
    },
  });
  assert.equal(output.status, 'completed');
  assert.equal(output.questionScore, 0);
  assert.equal(storageCalled, false);
  assert.equal(persisted.providerResult.result.comment.action.includes('micro'), true);
});

test('retryable provider failure is scheduled and permanent input failure dead-letters', async () => {
  const calls = [];
  const repository = {
    loadTask: async () => task(),
    startTask: async () => ({ started: true, modelExecutionId: 'execution-1' }),
    recordProgress: async () => {}, completeTask: async () => {},
    markRetry: async value => calls.push({ retry: value }),
    markDeadLetter: async value => calls.push({ dead: value }),
  };
  const retry = await worker.processEvent(event(), {
    repository, storage: { getSignedUrl: async () => 'https://media.example/q1.mp3' },
    endpoint: 'https://dify.example/v1', apiKey: 'secret',
    client: { score: async () => { throw Object.assign(new Error('busy'), { code: 'RATE', retryable: true }); } },
  });
  assert.equal(retry.status, 'retry');
  const dead = await worker.processEvent(event({ publishAttempts: 5 }), {
    repository, storage: { getSignedUrl: async () => 'https://media.example/q1.mp3' },
    endpoint: 'https://dify.example/v1', apiKey: 'secret',
    client: { score: async () => { throw Object.assign(new Error('bad'), { code: 'BAD', retryable: false }); } },
  });
  assert.equal(dead.status, 'dead_letter');
  assert.equal(calls.some(call => call.retry), true);
  assert.equal(calls.some(call => call.dead), true);
});

test('repository claims work durably and publishes the group event after question completion', () => {
  const source = fs.readFileSync(path.join(
    __dirname, '../src/modules/iig-ai-scoring/rtaQuestionScoringRepository.js'
  ), 'utf8');
  assert.match(source, /FOR UPDATE OF event SKIP LOCKED/);
  assert.match(source, /'SCORE_READY'/);
  assert.match(source, /'ERRORS_READY'/);
  assert.match(source, /'COMMENT_READY'/);
  assert.match(source, /'QUESTION_COMPLETED'/);
  assert.match(source, /'GROUP_SCORING_REQUESTED'/);
  assert.match(source, /event_type = \$3::varchar\(80\)/);
  assert.match(source, /SET question_scores = \$2::jsonb/);
});
