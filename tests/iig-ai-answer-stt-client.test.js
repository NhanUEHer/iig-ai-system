const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DifyAnswerSttError,
  buildDifyInputs,
  createIigAnswerSttClient,
} = require('../src/clients/iigAnswerSttClient');

function validInput(overrides = {}) {
  return {
    schema_version: 1,
    stt_profile: 'READ_ALOUD_GUIDED',
    question_code: 'S_Q1',
    reference_text: 'Good evening, everyone.',
    question_text: '',
    context_text: '',
    audio_url: 'https://media.example/answer.mp3',
    ...overrides,
  };
}

function successfulResponse(overrides = {}) {
  return {
    data: {
      task_id: 'task-1',
      workflow_run_id: 'workflow-run-1',
      data: {
        status: 'succeeded',
        outputs: {
          stt_result: {
            schema_version: 1,
            status: 'SUCCESS',
            transcript: 'Good evening, everyone.',
            detected_language: 'en',
            speech_detected: true,
            confidence: 0.94,
            flags: [],
          },
        },
        total_tokens: 1234,
        total_price: '0.0012',
        currency: 'USD',
        elapsed_time: 2.5,
        ...overrides,
      },
    },
  };
}

test('Dify input maps the canonical audio URL to one remote audio variable', () => {
  const inputs = buildDifyInputs(validInput());
  assert.deepEqual(inputs.student_audio, {
    type: 'audio',
    transfer_method: 'remote_url',
    url: 'https://media.example/answer.mp3',
  });
  assert.equal(inputs.audio_url, undefined);
  assert.equal(inputs.reference_text, 'Good evening, everyone.');
});

test('client calls the blocking workflow and returns canonical result plus lineage', async () => {
  const calls = [];
  const client = createIigAnswerSttClient({
    httpClient: {
      async post(...args) {
        calls.push(args);
        return successfulResponse();
      },
    },
  });
  const response = await client.transcribe({
    endpoint: 'https://dify.example/v1/',
    apiKey: 'secret-key',
    timeoutMs: 45000,
    input: validInput(),
    requestId: 'question-run-42',
    modelVersion: 'rta-stt-v1',
  });

  assert.equal(calls[0][0], 'https://dify.example/v1/workflows/run');
  assert.equal(calls[0][1].response_mode, 'blocking');
  assert.equal(calls[0][1].user, 'iig-ai-stt-question-run-42');
  assert.equal(calls[0][2].timeout, 45000);
  assert.equal(calls[0][2].headers.Authorization, 'Bearer secret-key');
  assert.equal(response.result.status, 'SUCCESS');
  assert.deepEqual(response.outcome, { action: 'CONTINUE', retryable: false, terminal: true });
  assert.equal(response.providerRunId, 'workflow-run-1');
  assert.equal(response.taskId, 'task-1');
  assert.equal(response.modelVersion, 'rta-stt-v1');
  assert.deepEqual(response.usage, {
    inputTokens: null,
    outputTokens: null,
    totalTokens: 1234,
    totalPrice: '0.0012',
    currency: 'USD',
    elapsedTime: 2.5,
  });
});

test('client preserves a valid no-speech business outcome', async () => {
  const response = successfulResponse({
    outputs: {
      stt_result: {
        schema_version: 1,
        status: 'NO_SPEECH',
        transcript: '',
        detected_language: null,
        speech_detected: false,
        confidence: 0.99,
        flags: ['ONLY_NOISE'],
      },
    },
  });
  const client = createIigAnswerSttClient({ httpClient: { post: async () => response } });
  const result = await client.transcribe({
    endpoint: 'https://dify.example/v1',
    apiKey: 'secret-key',
    input: validInput(),
    requestId: 'question-run-43',
  });
  assert.equal(result.result.status, 'NO_SPEECH');
  assert.deepEqual(result.outcome, { action: 'INVALID_AUDIO', retryable: false, terminal: true });
});

test('client accepts Dify partial-succeeded only when the output contract is valid', async () => {
  const client = createIigAnswerSttClient({
    httpClient: { post: async () => successfulResponse({ status: 'partial-succeeded' }) },
  });
  const response = await client.transcribe({
    endpoint: 'https://dify.example/v1',
    apiKey: 'secret-key',
    input: validInput(),
    requestId: 'question-run-partial',
  });
  assert.equal(response.workflowStatus, 'partial-succeeded');
  assert.equal(response.result.status, 'SUCCESS');
});

test('client rejects invalid config and input before calling Dify', async () => {
  let calls = 0;
  const client = createIigAnswerSttClient({
    httpClient: { post: async () => { calls += 1; } },
  });
  await assert.rejects(
    client.transcribe({
      endpoint: 'http://dify.example/v1',
      apiKey: 'secret-key',
      input: validInput(),
      requestId: 'run-1',
    }),
    error => error instanceof DifyAnswerSttError
      && error.code === 'IIG_AI_STT_DIFY_CONFIG_INVALID'
      && error.retryable === false
  );
  await assert.rejects(
    client.transcribe({
      endpoint: 'https://dify.example/v1',
      apiKey: 'secret-key',
      input: validInput({ audio_url: 'file:///private/audio.mp3' }),
      requestId: 'run-1',
    }),
    error => error.code === 'IIG_AI_STT_DIFY_INPUT_INVALID' && error.retryable === false
  );
  assert.equal(calls, 0);
});

test('timeout, rate limit and server errors are retryable', async () => {
  const cases = [
    [{ code: 'ECONNABORTED', message: 'timeout' }, 'IIG_AI_STT_DIFY_TIMEOUT'],
    [{ response: { status: 429, data: { message: 'slow down' } } }, 'IIG_AI_STT_DIFY_RATE_LIMITED'],
    [{ response: { status: 503, data: { message: 'unavailable' } } }, 'IIG_AI_STT_DIFY_UNAVAILABLE'],
  ];
  for (const [failure, code] of cases) {
    const client = createIigAnswerSttClient({
      httpClient: { post: async () => { throw failure; } },
    });
    await assert.rejects(
      client.transcribe({
        endpoint: 'https://dify.example/v1',
        apiKey: 'secret-key',
        input: validInput(),
        requestId: 'run-retry',
      }),
      error => error.code === code && error.retryable === true
    );
  }
});

test('authentication and malformed requests are permanent provider errors', async () => {
  const cases = [
    [401, 'IIG_AI_STT_DIFY_AUTH_FAILED'],
    [422, 'IIG_AI_STT_DIFY_REQUEST_REJECTED'],
  ];
  for (const [status, code] of cases) {
    const client = createIigAnswerSttClient({
      httpClient: { post: async () => { throw { response: { status, data: {} } }; } },
    });
    await assert.rejects(
      client.transcribe({
        endpoint: 'https://dify.example/v1',
        apiKey: 'secret-key',
        input: validInput(),
        requestId: 'run-permanent',
      }),
      error => error.code === code && error.retryable === false
    );
  }
});

test('failed Dify workflow carries the provider run ID for diagnostics', async () => {
  const client = createIigAnswerSttClient({
    httpClient: {
      post: async () => successfulResponse({ status: 'failed', error: 'model unavailable' }),
    },
  });
  await assert.rejects(
    client.transcribe({
      endpoint: 'https://dify.example/v1',
      apiKey: 'secret-key',
      input: validInput(),
      requestId: 'run-failed',
    }),
    error => error.code === 'IIG_AI_STT_DIFY_WORKFLOW_FAILED'
      && error.retryable === true
      && error.providerRunId === 'workflow-run-1'
  );
});

test('invalid model output retains parser retry semantics', async () => {
  const client = createIigAnswerSttClient({
    httpClient: {
      post: async () => successfulResponse({ outputs: { stt_result: 'not-json' } }),
    },
  });
  await assert.rejects(
    client.transcribe({
      endpoint: 'https://dify.example/v1',
      apiKey: 'secret-key',
      input: validInput(),
      requestId: 'run-invalid-output',
    }),
    error => error.code === 'IIG_AI_STT_OUTPUT_JSON_INVALID' && error.retryable === true
  );
});
