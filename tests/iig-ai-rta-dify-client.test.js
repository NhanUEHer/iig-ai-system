const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const {
  buildDifyInputs,
  createIigRtaDifyClient,
} = require('../src/clients/iigRtaDifyClient');

function input() {
  return {
    jobId: 'run-1', keycode: 'ABC123', questionId: 's_q1',
    textPassage: 'Good evening everyone.', transcript: 'Good evening everyone.',
    audioUrl: 'https://media.example/q1.mp3',
  };
}

function finalResult() {
  return {
    schema_version: 'rta-question-result-v1', job_id: 'run-1', keycode: 'ABC123',
    question_id: 's_q1', group_code: 'READ_TEXT_ALOUD', status: 'COMPLETED',
    pronunciation_score: 3, intonation_stress_score: 3,
    question_score_raw: 3, question_score_rounded: 3, zero_reason: null,
    rule_signals: {}, errors: [],
    comment: {
      strength: 'Bạn đọc rõ.', improvement: 'Tiếp tục giữ nhịp.',
      action: 'Hãy luyện thêm.', text: 'Bạn đọc rõ. Tiếp tục giữ nhịp. Hãy luyện thêm.',
    },
    versions: {},
  };
}

function sse(frame) {
  return `data: ${JSON.stringify(frame)}\n\n`;
}

test('maps the BE contract to one Dify audio-file workflow input', () => {
  const mapped = buildDifyInputs(input());
  assert.equal(mapped.schema_version, 'rta-question-input-v1');
  assert.equal(mapped.ai_status, 'READY_FOR_AI');
  assert.equal(mapped.scoring_disposition, 'NORMAL');
  assert.equal(mapped.zero_reason, 'NONE');
  assert.equal(mapped.zero_origin, 'NONE');
  assert.equal(mapped.resolution_metadata_json, '{}');
  assert.deepEqual(mapped.student_audio, {
    type: 'audio', transfer_method: 'remote_url', url: 'https://media.example/q1.mp3',
  });
});

test('maps upstream no-speech to the deterministic zero branch without transcript or audio', () => {
  const mapped = buildDifyInputs({
    ...input(), transcript: '', audioUrl: '', upstreamZeroReason: 'NO_SPEECH',
  });
  assert.equal(mapped.ai_status, 'ZERO_SCORE');
  assert.equal(mapped.upstream_zero_reason, 'NO_SPEECH');
  assert.equal(mapped.scoring_disposition, 'ZERO_RESPONSE_QUALITY');
  assert.equal(mapped.zero_reason, 'NO_SPEECH');
  assert.equal(mapped.zero_origin, 'RESPONSE_QUALITY');
  assert.equal(mapped.student_audio, undefined);
});

test('maps canonical source-data zero without transcript or audio', () => {
  const mapped = buildDifyInputs({
    ...input(), textPassage: '', transcript: '', audioUrl: '',
    scoringDisposition: 'ZERO_SOURCE_DATA', zeroReason: 'SOURCE_AUDIO_NOT_FOUND',
    zeroOrigin: 'SOURCE_DATA', resolutionMetadata: { provider: 'S3', attempts: 1 },
  });
  assert.equal(mapped.ai_status, 'ZERO_SCORE');
  assert.equal(mapped.scoring_disposition, 'ZERO_SOURCE_DATA');
  assert.equal(mapped.zero_reason, 'SOURCE_AUDIO_NOT_FOUND');
  assert.equal(mapped.zero_origin, 'SOURCE_DATA');
  assert.equal(mapped.resolution_metadata_json, '{"provider":"S3","attempts":1}');
  assert.equal(mapped.student_audio, undefined);
});

test('consumes progress and final result from the streaming workflow', async () => {
  const progress = {
    schema_version: 'rta-progress-event-v1', event_type: 'SCORE_READY',
    job_id: 'run-1', question_id: 's_q1', sequence: 1,
    data: { question_score_rounded: 3 },
  };
  const stream = Readable.from([
    sse({ event: 'node_finished', task_id: 'task-1', workflow_run_id: 'wf-1',
      data: { outputs: { score_event_json: JSON.stringify(progress) } } }),
    sse({ event: 'workflow_finished', task_id: 'task-1', workflow_run_id: 'wf-1',
      data: { status: 'succeeded', outputs: { result_json: JSON.stringify(finalResult()) },
        total_tokens: 100, elapsed_time: 1.25 } }),
  ]);
  const calls = [];
  const client = createIigRtaDifyClient({
    httpClient: { post: async (...args) => { calls.push(args); return { data: stream }; } },
  });
  const received = [];
  const output = await client.score({
    endpoint: 'https://dify.example/v1', apiKey: 'secret', input: input(),
    requestId: 'execution-1', onProgress: event => received.push(event.eventType),
  });
  assert.equal(calls[0][1].response_mode, 'streaming');
  assert.deepEqual(received, ['SCORE_READY', 'QUESTION_COMPLETED']);
  assert.equal(output.result.questionScoreRounded, 3);
  assert.equal(output.providerRunId, 'wf-1');
});

test('rejects provider auth errors without retry', async () => {
  const client = createIigRtaDifyClient({
    httpClient: { post: async () => { throw { response: { status: 401, data: {} } }; } },
  });
  await assert.rejects(
    client.score({ endpoint: 'https://dify.example/v1', apiKey: 'bad', input: input() }),
    error => error.code === 'IIG_AI_RTA_DIFY_AUTH_FAILED' && error.retryable === false
  );
});
