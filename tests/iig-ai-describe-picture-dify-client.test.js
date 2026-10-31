const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const {
  buildDifyInputs,
  createIigDescribePictureDifyClient,
} = require('../src/clients/iigDescribePictureDifyClient');

function input() {
  return {
    jobId: 'run-1', keycode: 'ABC123', questionId: 's_q3',
    promptText: 'Describe the picture.', transcript: 'Two people are talking.',
    audioUrl: 'https://media.example/q3.mp3',
    imageUrl: 'https://media.example/q3.png',
  };
}

function finalResult() {
  return {
    schema_version: 'describe-picture-question-result-v1',
    job_id: 'run-1', keycode: 'ABC123', question_id: 's_q3',
    group_code: 'DESCRIBE_PICTURE', status: 'COMPLETED',
    pronunciation_score: 3, intonation_fluency_score: 2, grammar_score: 2,
    vocabulary_score: 2, cohesion_score: 3,
    question_score_raw: 2.4, question_score_rounded: 2, zero_reason: null,
    rule_signals: {}, applied_rules: [], errors: [],
    comment: {
      strength: 'Bạn nêu được cảnh chính.', improvement: 'Cần thêm chi tiết.',
      action: 'Hãy mô tả theo thứ tự tổng quan đến chi tiết.',
      text: 'Bạn nêu được cảnh chính. Cần thêm chi tiết. Hãy mô tả theo thứ tự tổng quan đến chi tiết.',
    },
    versions: {},
  };
}

function sse(frame) {
  return `data: ${JSON.stringify(frame)}\n\n`;
}

test('maps audio and image to distinct Dify file inputs', () => {
  const mapped = buildDifyInputs(input());
  assert.equal(mapped.schema_version, 'describe-picture-question-input-v1');
  assert.equal(mapped.group_code, 'DESCRIBE_PICTURE');
  assert.equal(mapped.student_audio.type, 'audio');
  assert.equal(mapped.prompt_image.type, 'image');
});

test('upstream zero does not require audio, image or transcript', () => {
  const mapped = buildDifyInputs({
    ...input(), transcript: '', audioUrl: '', imageUrl: '', upstreamZeroReason: 'NO_SPEECH',
  });
  assert.equal(mapped.ai_status, 'ZERO_SCORE');
  assert.equal(mapped.student_audio, undefined);
  assert.equal(mapped.prompt_image, undefined);
});

test('consumes progressive output and final Q3 result', async () => {
  const progress = {
    schema_version: 'describe-picture-progress-event-v1', event_type: 'SCORE_READY',
    job_id: 'run-1', question_id: 's_q3', sequence: 1,
    data: { question_score_rounded: 2 },
  };
  const stream = Readable.from([
    sse({ event: 'node_finished', task_id: 'task-1', workflow_run_id: 'wf-1',
      data: { outputs: { score_event_json: JSON.stringify(progress) } } }),
    sse({ event: 'workflow_finished', task_id: 'task-1', workflow_run_id: 'wf-1',
      data: { status: 'succeeded', outputs: { result_json: JSON.stringify(finalResult()) } } }),
  ]);
  const received = [];
  const client = createIigDescribePictureDifyClient({
    httpClient: { post: async () => ({ data: stream }) },
  });
  const output = await client.score({
    endpoint: 'https://dify.example/v1', apiKey: 'secret', input: input(),
    onProgress: event => received.push(event.eventType),
  });
  assert.deepEqual(received, ['SCORE_READY', 'QUESTION_COMPLETED']);
  assert.equal(output.result.questionScoreRounded, 2);
});
