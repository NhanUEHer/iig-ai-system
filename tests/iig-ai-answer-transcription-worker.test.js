const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const worker = require('../src/modules/iig-ai-scoring/answerTranscriptionWorker');

const RUN_ID = '11a111ba-2883-78ce-98dd-335a6c85fc54';
const QUESTION_RUN_ID = '21a111ba-2883-78ce-98dd-335a6c85fc54';
const ATTEMPT_ID = '31a111ba-2883-78ce-98dd-335a6c85fc54';
const TRANSCRIPTION_ID = '41a111ba-2883-78ce-98dd-335a6c85fc54';
const MEDIA_ID = '51a111ba-2883-78ce-98dd-335a6c85fc54';
const EXECUTION_ID = '61a111ba-2883-78ce-98dd-335a6c85fc54';

function event(overrides = {}) {
  return {
    id: '71a111ba-2883-78ce-98dd-335a6c85fc54',
    runId: RUN_ID,
    eventType: 'ANSWER_TRANSCRIPTION_REQUESTED',
    payload: {
      scoringRunId: RUN_ID,
      questionRunId: QUESTION_RUN_ID,
      questionAttemptId: ATTEMPT_ID,
      transcriptionId: TRANSCRIPTION_ID,
      mediaAssetId: MEDIA_ID,
    },
    publishAttempts: 1,
    lockedBy: 'answer-stt-worker-1',
    ...overrides,
  };
}

function task(overrides = {}) {
  return {
    runId: RUN_ID,
    questionRunId: QUESTION_RUN_ID,
    questionAttemptId: ATTEMPT_ID,
    transcriptionId: TRANSCRIPTION_ID,
    transcriptionStatus: 'PENDING',
    questionRunStatus: 'TRANSCRIBING',
    aiInput: {
      question: {
        scorerType: 'READ_TEXT_ALOUD',
        contextText: 'Good evening, everyone.',
      },
      response: { type: 'audio' },
    },
    questionNumber: 1,
    scorerType: 'READ_TEXT_ALOUD',
    mediaAssetId: MEDIA_ID,
    storageProvider: 'R2',
    storageBucket: 'iig-ai-dev',
    storageKey: 'cleaned-audio/test.mp3',
    mimeType: 'audio/mpeg',
    audioChecksum: 'a'.repeat(64),
    ...overrides,
  };
}

function result(status = 'SUCCESS') {
  const success = status === 'SUCCESS';
  const action = success
    ? 'CONTINUE'
    : status === 'NO_SPEECH' ? 'INVALID_AUDIO' : 'REVIEW_REQUIRED';
  return {
    provider: 'dify',
    providerRunId: 'provider-run-1',
    taskId: 'task-1',
    workflowStatus: 'succeeded',
    result: {
      schemaVersion: 1,
      status,
      transcript: success ? 'Good evening, everyone.' : '',
      detectedLanguage: success ? 'en' : null,
      speechDetected: success,
      confidence: 0.98,
      flags: [],
    },
    outcome: { action, retryable: false, terminal: true },
    usage: {
      inputTokens: 800,
      outputTokens: 30,
      totalTokens: 830,
      elapsedTime: 4.2,
      totalPrice: null,
      currency: null,
    },
  };
}

function dependencies(overrides = {}) {
  const calls = [];
  const repository = {
    loadTask: async () => task(),
    startTask: async input => {
      calls.push({ type: 'start', input });
      return { started: true, modelExecutionId: EXECUTION_ID };
    },
    completeTask: async input => {
      calls.push({ type: 'complete', input });
      return {
        completed: true,
        questionStatus: input.providerResult.outcome.action === 'CONTINUE'
          ? 'EXTRACTING_FEATURES'
          : input.providerResult.outcome.action === 'INVALID_AUDIO'
            ? 'INVALID_AUDIO'
            : 'REVIEW_REQUIRED',
      };
    },
    markRetry: async input => calls.push({ type: 'retry', input }),
    markDeadLetter: async input => calls.push({ type: 'dead_letter', input }),
  };
  return {
    calls,
    values: {
      repository,
      storage: {
        getSignedUrl: async () => 'https://r2.example.test/audio.mp3?signature=test',
        downloadBuffer: async () => ({ buffer: Buffer.from('test-audio') }),
      },
      difyClient: { transcribe: async () => result() },
      endpoint: 'https://dify.example.test/v1',
      apiKey: 'test-api-key',
      modelName: 'gemini-3.8-flash',
      modelVersion: 'gemini-3.8-flash',
      promptVersion: 'answer-stt-v1',
      featureVersion: 'features-v1',
      maxAttempts: 5,
      ...overrides,
    },
  };
}

test('answer STT repository uses a durable skip-locked queue and persists lineage', () => {
  const source = fs.readFileSync(path.join(
    __dirname,
    '../src/modules/iig-ai-scoring/answerTranscriptionRepository.js'
  ), 'utf8');
  assert.match(source, /event_type = 'ANSWER_TRANSCRIPTION_REQUESTED'/);
  assert.match(source, /FOR UPDATE SKIP LOCKED/);
  assert.match(source, /INSERT INTO iig_ai_model_executions/);
  assert.match(source, /providerResult\.rawOutput/);
  assert.match(source, /'FEATURE_EXTRACTION_REQUESTED'/);
  assert.match(source, /'QUESTION_SCORING_REQUESTED'/);
  assert.match(source, /upstreamZeroReason/);
  assert.match(
    source,
    /scoring_run\.status IN \('TRANSCRIBING', 'EXTRACTING_FEATURES', 'SCORING_QUESTIONS'\)/
  );
  assert.match(source, /ON CONFLICT \(deduplication_key\) DO NOTHING/);
});

test('successful RTA transcript is persisted and advances to feature extraction through Dify', async () => {
  const deps = dependencies();
  let difyCalled = false;
  deps.values.difyClient = { transcribe: async () => { difyCalled = true; return result(); } };
  const output = await worker.processEvent(event(), deps.values);
  assert.equal(output.status, 'completed');
  assert.equal(output.outputStatus, 'SUCCESS');
  assert.equal(output.questionStatus, 'EXTRACTING_FEATURES');
  const started = deps.calls.find(call => call.type === 'start');
  assert.match(started.input.requestHash, /^[0-9a-f]{64}$/);
  const completed = deps.calls.find(call => call.type === 'complete');
  assert.equal(completed.input.providerResult.usage.totalTokens, 830);
  assert.match(completed.input.responseHash, /^[0-9a-f]{64}$/);
  assert.equal(difyCalled, true);
  assert.equal(started.input.config.provider, 'DIFY');
});

test('NO_SPEECH is a terminal business outcome and becomes invalid audio', async () => {
  const deps = dependencies({ difyClient: { transcribe: async () => result('NO_SPEECH') } });
  const output = await worker.processEvent(event(), deps.values);
  assert.equal(output.status, 'completed');
  assert.equal(output.outputStatus, 'NO_SPEECH');
  assert.equal(output.questionStatus, 'INVALID_AUDIO');
  assert.equal(deps.calls.some(call => call.type === 'retry'), false);
});

test('wrong language is routed to review without provider retry', async () => {
  const wrongLanguage = result('WRONG_LANGUAGE_VI');
  wrongLanguage.result.detectedLanguage = 'vi';
  const deps = dependencies({ difyClient: { transcribe: async () => wrongLanguage } });
  const output = await worker.processEvent(event(), deps.values);
  assert.equal(output.status, 'completed');
  assert.equal(output.questionStatus, 'REVIEW_REQUIRED');
  assert.equal(deps.calls.some(call => call.type === 'retry'), false);
});

test('retryable provider errors retain task lineage and use exponential backoff', async () => {
  const deps = dependencies({
    difyClient: {
      transcribe: async () => {
        throw Object.assign(new Error('temporary provider failure'), {
          code: 'IIG_AI_STT_DIFY_UNAVAILABLE',
          retryable: true,
        });
      },
    },
  });
  const output = await worker.processEvent(event({ publishAttempts: 2 }), deps.values);
  assert.equal(output.status, 'retry');
  assert.equal(output.delayMs, 10_000);
  const retry = deps.calls.find(call => call.type === 'retry');
  assert.equal(retry.input.modelExecutionId, EXECUTION_ID);
  assert.equal(retry.input.task.transcriptionId, TRANSCRIPTION_ID);
});

test('invalid canonical input is dead-lettered without calling Dify', async () => {
  let providerCalled = false;
  const deps = dependencies({
    repository: {
      loadTask: async () => task({ aiInput: null }),
      markDeadLetter: async input => deps.calls.push({ type: 'dead_letter', input }),
      markRetry: async input => deps.calls.push({ type: 'retry', input }),
    },
    difyClient: { transcribe: async () => { providerCalled = true; } },
  });
  const output = await worker.processEvent(event(), deps.values);
  assert.equal(output.status, 'dead_letter');
  assert.equal(output.code, 'IIG_AI_ANSWER_STT_INPUT_INVALID');
  assert.equal(providerCalled, false);
});

test('configuration requires an endpoint, API key and explicit model lineage', () => {
  assert.throws(
    () => worker.resolveConfig({ endpoint: '', apiKey: '', modelName: '', modelVersion: '' }),
    error => error.code === 'IIG_AI_STT_CONFIG_MISSING' && error.retryable === false
  );
  const config = worker.resolveConfig({
    endpoint: 'https://dify.example.test/v1',
    apiKey: 'test-key',
    modelName: 'gemini-3.8-flash',
    modelVersion: 'gemini-3.8-flash',
  });
  assert.equal(config.promptVersion, 'answer-stt-v1');
  assert.equal(config.provider, 'DIFY');
});

test('RTA uses the same Dify STT configuration as other speaking questions', () => {
  const config = worker.resolveConfig({
    endpoint: 'https://dify.example.test/v1',
    apiKey: 'test-key',
    modelName: 'gemini-3.8-flash',
    modelVersion: 'test-v1',
  }, 'READ_TEXT_ALOUD');
  assert.equal(config.provider, 'DIFY');
  assert.equal(config.promptVersion, 'answer-stt-v1');
});

test('batch worker claims and processes eleven answer recordings concurrently', async () => {
  const queue = Array.from({ length: 11 }, (_, index) => event({
    id: `event-${index + 1}`,
    payload: { ...event().payload, questionRunId: `question-${index + 1}` },
  }));
  let active = 0;
  let maximumActive = 0;
  const repository = {
    claimNext: async () => queue.shift() || null,
    loadTask: async claimed => task({ questionRunId: claimed.payload.questionRunId }),
    startTask: async ({ task: loaded }) => ({
      started: true,
      modelExecutionId: `execution-${loaded.questionRunId}`,
    }),
    completeTask: async () => ({ completed: true, questionStatus: 'EXTRACTING_FEATURES' }),
    markRetry: async () => {},
    markDeadLetter: async () => {},
  };
  const difyClient = {
    transcribe: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setTimeout(resolve, 15));
      active -= 1;
      return result();
    },
  };

  const outputs = await worker.runBatch({
    ...dependencies().values,
    repository,
    difyClient,
    concurrency: 11,
    workerId: 'answer-stt-concurrency-test',
  });

  assert.equal(outputs.length, 11);
  assert.equal(outputs.filter(output => output?.status === 'completed').length, 11);
  assert.equal(maximumActive, 11);
});
