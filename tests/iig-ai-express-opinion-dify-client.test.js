const assert = require('node:assert/strict');
const test = require('node:test');
const { Readable } = require('node:stream');
const {
  buildDifyInputs,
  createIigExpressOpinionDifyClient,
} = require('../src/clients/iigExpressOpinionDifyClient');

test('maps Q11 without retranscribing the response', () => {
  const mapped = buildDifyInputs({
    jobId: 'run-1', keycode: 'abc', scorerType: 'EXPRESS_AN_OPINION', questionNumber: 11,
    questionText: 'Should companies allow remote work?',
    transcript: 'I agree because it saves commuting time.',
    audioUrl: 'https://media.example/q11.mp3', audioDurationSeconds: 48,
    responseWordCount: 8,
  });
  assert.equal(mapped.question_id, 's_q11');
  assert.equal(mapped.response_profile, 'EXTENDED_OPINION');
  assert.equal(mapped.transcript.startsWith('I agree'), true);
  assert.equal(mapped.student_audio.type, 'audio');
});

test('consumes the final holistic result from a Dify SSE stream', async () => {
  const finalResult = {
    schema_version: 'express-opinion-question-result-v1', job_id: 'run-1', keycode: 'ABC',
    question_id: 's_q11', group_code: 'EXPRESS_AN_OPINION', response_profile: 'EXTENDED_OPINION',
    status: 'COMPLETED', pronunciation_score: 4, intonation_fluency_score: 4,
    grammar_score: 4, vocabulary_score: 4, cohesion_score: 4,
    relevance_score: 4, completeness_score: 4, holistic_score_preliminary: 4,
    question_score_final: 4, zero_reason: null,
    rule_signals: {
      stance_status: 'CLEAR', prompt_alignment_ratio: 1, reason_count: 2,
      developed_reason_count: 2, example_count: 1, support_development: 'STRONG',
      copied_prompt_only: false, completely_unrelated: false, cut_off: false,
      excessive_fillers: false,
    }, applied_rules: [], errors: [],
    comment: { strength: 'Tốt.', improvement: 'Cần rõ hơn.', action: 'Thêm ví dụ.' },
    versions: {},
  };
  const stream = Readable.from([`data: ${JSON.stringify({
    event: 'workflow_finished', task_id: 'task-1', workflow_run_id: 'wf-1',
    data: { status: 'succeeded', outputs: { result_json: JSON.stringify(finalResult) }, total_tokens: 500 },
  })}\n\n`]);
  const client = createIigExpressOpinionDifyClient({ httpClient: { post: async () => ({ data: stream }) } });
  const output = await client.score({
    endpoint: 'https://dify.example/v1', apiKey: 'secret',
    input: {
      jobId: 'run-1', keycode: 'abc', scorerType: 'EXPRESS_AN_OPINION', questionNumber: 11,
      questionText: 'Should companies allow remote work?', transcript: 'Yes, for two reasons.',
      audioUrl: 'https://media.example/q11.mp3',
    },
  });
  assert.equal(output.result.questionScoreFinal, 4);
  assert.equal(output.usage.totalTokens, 500);
});
