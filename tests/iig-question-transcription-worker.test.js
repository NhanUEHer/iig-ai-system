const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const worker = require('../src/modules/iig-ingestion/questionTranscriptionWorker');

const event = {
  id: '8a11ff0e-fb67-4dda-a4bc-adf3582f49bf',
  jobId: 'b3ec3a90-e447-4f88-b2e2-99ead7f32468',
  publishAttempts: 1,
  lockedBy: 'question-stt-worker-1',
};

function task(overrides = {}) {
  return {
    id: 'transcription-1',
    exam_question_id: 'question-8',
    media_asset_id: 'asset-question-8',
    question_number: 8,
    scorer_type: 'RESPOND_USING_INFORMATION',
    context_text: 'Cooking class information.',
    section_type: 'SPEAKING',
    canonical_storage_provider: 'R2',
    canonical_storage_bucket: 'iig-ai-dev',
    canonical_storage_key: 'iig/question-8.mp3',
    canonical_mime_type: 'audio/mpeg',
    ...overrides,
  };
}

test('question STT transcribes canonical audio and persists a reusable exam transcript', async () => {
  const writes = [];
  const calls = [];
  const result = await worker.processEvent(event, {
    repository: {
      loadTasks: async () => [task()],
      markTaskProcessing: async () => true,
      markTaskCompleted: async input => writes.push(input),
      markTaskFailed: async () => assert.fail('must not fail'),
      completeEvent: async () => ({ submissionId: 'submission-1' }),
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
    findAgent: async query => {
      calls.push(['agent', query]);
      return { id: 12, api_endpoint: 'https://dify.example/v1', api_key: 'secret' };
    },
    storage: {
      getSignedUrl: async reference => {
        calls.push(['storage', reference]);
        return 'https://r2.example/question-8.mp3?signature=temporary';
      },
    },
    dify: {
      transcribeSpeech: async (...args) => {
        calls.push(['dify', ...args]);
        return { data: { outputs: { transcribe: 'Could you tell me the class schedule?' } } };
      },
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.completed, 1);
  assert.equal(writes[0].transcript, 'Could you tell me the class schedule?');
  assert.equal(writes[0].agentId, 12);
  assert.deepEqual(calls[0][1], {
    apiType: 'STT', sttTarget: 'question', questionType: 'sp_respond_info',
  });
  assert.deepEqual(calls[1], ['storage', 'r2:iig/question-8.mp3']);
  assert.equal(calls[2][4], 'audio_question');
  assert.equal(calls[2][5], 'Cooking class information.');
});

test('question STT retries an empty model response', async () => {
  let retry;
  const result = await worker.processEvent(event, {
    repository: {
      loadTasks: async () => [task()],
      markTaskProcessing: async () => true,
      markTaskCompleted: async () => assert.fail('must not complete'),
      markTaskFailed: async () => {},
      completeEvent: async () => assert.fail('must not complete event'),
      markRetry: async input => { retry = input; },
      markDeadLetter: async () => assert.fail('must not dead-letter first transient failure'),
    },
    findAgent: async () => ({ id: 12, api_endpoint: 'https://dify.example/v1', api_key: 'secret' }),
    storage: { getSignedUrl: async () => 'https://r2.example/question-8.mp3' },
    dify: { transcribeSpeech: async () => ({ data: { outputs: {} } }) },
  });

  assert.equal(result.status, 'retry');
  assert.equal(result.code, 'IIG_QUESTION_STT_EMPTY');
  assert.equal(retry.delayMs, 10_000);
});

test('question STT uses direct Gemini audio transcription when a runtime key is configured', async () => {
  const writes = [];
  const calls = [];
  const result = await worker.processEvent(event, {
    repository: {
      loadTasks: async () => [task()],
      markTaskProcessing: async () => true,
      markTaskCompleted: async input => writes.push(input),
      markTaskFailed: async () => assert.fail('must not fail'),
      completeEvent: async () => ({ submissionId: 'submission-1' }),
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
    provider: 'gemini',
    geminiApiKey: 'runtime-secret',
    geminiModel: 'gemini-3.8-flash',
    findAgent: async () => assert.fail('must not resolve a Dify agent'),
    storage: {
      downloadBuffer: async reference => {
        calls.push(['storage', reference]);
        return { buffer: Buffer.from('audio-data'), contentType: 'audio/mpeg' };
      },
    },
    gemini: {
      transcribeQuestion: async input => {
        calls.push(['gemini', input]);
        return {
          transcript: 'Could you tell me the class schedule?',
          metadata: { provider: 'gemini', model: 'gemini-3.8-flash', usage: { totalTokenCount: 21 } },
        };
      },
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(writes[0].agentId, null);
  assert.equal(writes[0].metadata.provider, 'gemini');
  assert.deepEqual(calls[0], ['storage', 'r2:iig/question-8.mp3']);
  assert.equal(calls[1][1].apiKey, 'runtime-secret');
  assert.equal(calls[1][1].contextText, 'Cooking class information.');
});

test('question STT falls back to Dify when direct Gemini transcription fails', async () => {
  const writes = [];
  const result = await worker.processEvent(event, {
    repository: {
      loadTasks: async () => [task()],
      markTaskProcessing: async () => true,
      markTaskCompleted: async input => writes.push(input),
      markTaskFailed: async () => assert.fail('must not fail'),
      completeEvent: async () => ({ submissionId: 'submission-1' }),
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
    provider: 'gemini',
    geminiApiKey: 'runtime-secret',
    difyFallback: true,
    gemini: {
      transcribeQuestion: async () => {
        throw Object.assign(new Error('Gemini unavailable'), { code: 'GEMINI_QUESTION_STT_FAILED' });
      },
    },
    findAgent: async () => ({ id: 12, api_endpoint: 'https://dify.example/v1', api_key: 'secret' }),
    storage: {
      downloadBuffer: async () => ({ buffer: Buffer.from('audio-data'), contentType: 'audio/mpeg' }),
      getSignedUrl: async () => 'https://r2.example/question-8.mp3',
    },
    dify: {
      transcribeSpeech: async () => ({
        data: { outputs: { transcribe: 'Could you tell me the class schedule?' } },
      }),
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(writes[0].agentId, 12);
  assert.equal(writes[0].metadata.provider, 'dify');
  assert.equal(writes[0].metadata.geminiFallbackCode, 'GEMINI_QUESTION_STT_FAILED');
});

test('question STT preserves a failed Dify workflow error for retry diagnostics', async () => {
  let failedError;
  const result = await worker.processEvent(event, {
    repository: {
      loadTasks: async () => [task()],
      markTaskProcessing: async () => true,
      markTaskCompleted: async () => assert.fail('must not complete'),
      markTaskFailed: async (_taskId, error) => { failedError = error; },
      completeEvent: async () => assert.fail('must not complete event'),
      markRetry: async () => {},
      markDeadLetter: async () => assert.fail('must not dead-letter first transient failure'),
    },
    findAgent: async () => ({ id: 12, api_endpoint: 'https://dify.example/v1', api_key: 'secret' }),
    storage: { getSignedUrl: async () => 'https://r2.example/question-8.mp3' },
    dify: {
      transcribeSpeech: async () => ({
        data: { status: 'failed', error: 'Configured model is unavailable.', outputs: {} },
      }),
    },
  });

  assert.equal(result.status, 'retry');
  assert.equal(result.code, 'IIG_QUESTION_STT_WORKFLOW_FAILED');
  assert.equal(failedError.message, 'Configured model is unavailable.');
});

test('question STT revalidates when another worker already completed the shared transcript', async () => {
  let completed = false;
  const result = await worker.processEvent(event, {
    repository: {
      loadTasks: async () => [],
      completeEvent: async () => { completed = true; return { submissionId: 'submission-1' }; },
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.completed, 0);
  assert.equal(completed, true);
});

test('question STT requires a public origin for local canonical media', async () => {
  await assert.rejects(
    () => worker.resolveAudioUrl(
      task({ canonical_storage_provider: 'LOCAL' }),
      { getSignedUrl: async () => '/question-bank-media/iig/question-8.mp3' },
      ''
    ),
    error => error.code === 'IIG_STT_PUBLIC_URL_REQUIRED' && error.retryable === false
  );
});

test('question STT repository is durable and the server starts the worker', () => {
  const root = path.resolve(__dirname, '..');
  const repository = fs.readFileSync(
    path.join(root, 'src/modules/iig-ingestion/questionTranscriptionRepository.js'),
    'utf8'
  );
  const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
  assert.match(repository, /FOR UPDATE SKIP LOCKED/);
  assert.match(repository, /QUESTION_TRANSCRIPTION_REQUESTED/);
  assert.match(repository, /input-validation:post-question-stt:v1/);
  assert.match(repository, /QUESTION_TRANSCRIPTION_COMPLETED/);
  assert.match(server, /iigQuestionTranscriptionWorker\.startWorker/);
  assert.match(server, /iigQuestionTranscriptionWorker\.stopWorker/);
});
