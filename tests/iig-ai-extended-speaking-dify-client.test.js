const assert = require('node:assert/strict');
const test = require('node:test');
const { Readable } = require('node:stream');

const {
  buildDifyInputs,
  createIigExtendedSpeakingDifyClient,
} = require('../src/clients/iigExtendedSpeakingDifyClient');
const {
  buildDifyInputs: buildGroupInputs,
} = require('../src/clients/iigQ5Q10GroupDifyClient');

test('maps Q7 to the extended-response branch without duplicating STT', () => {
  const mapped = buildDifyInputs({
    jobId: 'run-1', keycode: 'abc', scorerType: 'RESPOND_TO_QUESTIONS',
    questionNumber: 7, questionText: 'Describe your favorite program.',
    transcript: 'My favorite program is a documentary because it is educational.',
    audioUrl: 'https://media.example/q7.mp3', audioDurationSeconds: 21,
    responseWordCount: 10,
  });
  assert.equal(mapped.response_profile, 'EXTENDED_RESPONSE');
  assert.equal(mapped.question_id, 's_q7');
  assert.equal(mapped.student_audio.type, 'audio');
  assert.equal(mapped.transcript.startsWith('My favorite'), true);
});

test('Q10 requires information context and maps its image independently', () => {
  assert.throws(() => buildDifyInputs({
    jobId: 'run-1', keycode: 'abc', scorerType: 'RESPOND_USING_INFORMATION',
    questionNumber: 10, questionText: 'What happens before lunch?',
    transcript: 'There are two sessions.', audioUrl: 'https://media.example/q10.mp3',
  }), /contextText or contextImageUrl/);
  const mapped = buildDifyInputs({
    jobId: 'run-1', keycode: 'abc', scorerType: 'RESPOND_USING_INFORMATION',
    questionNumber: 10, questionText: 'What happens before lunch?',
    contextImageUrl: 'https://media.example/schedule.png',
    transcript: 'There are two sessions.', audioUrl: 'https://media.example/q10.mp3',
  });
  assert.equal(mapped.response_profile, 'MULTI_ITEM_INFORMATION');
  assert.equal(mapped.context_image.type, 'image');
});

test('upstream zero does not fetch or require Q10 context media', () => {
  const mapped = buildDifyInputs({
    jobId: 'run-1', keycode: 'abc', scorerType: 'RESPOND_USING_INFORMATION',
    questionNumber: 10, questionText: 'Which two sessions are before lunch?',
    transcript: '', audioUrl: '', contextText: '', contextImageUrl: '',
    upstreamZeroReason: 'NO_SPEECH',
  });
  assert.equal(mapped.ai_status, 'ZERO_SCORE');
  assert.equal(mapped.student_audio, undefined);
  assert.equal(mapped.context_image, undefined);
});

test('group input requires exactly all six Q5-Q10 question results', () => {
  const base = {
    scorerType: 'RESPOND_TO_QUESTIONS', responseProfile: 'SHORT_DIRECT_RESPONSE',
    pronunciationScore: 2, intonationFluencyScore: 2, grammarScore: 2,
    vocabularyScore: 2, cohesionScore: 2, relevanceScore: 2,
    completenessScore: 2, finalScore: 2,
  };
  const questionScores = Object.fromEntries([5, 6, 7, 8, 9, 10].map(number => [
    `s_q${number}`,
    {
      ...base,
      scorerType: number <= 7 ? 'RESPOND_TO_QUESTIONS' : 'RESPOND_USING_INFORMATION',
      responseProfile: [5, 6].includes(number) ? 'SHORT_DIRECT_RESPONSE'
        : number === 7 ? 'EXTENDED_RESPONSE'
          : [8, 9].includes(number) ? 'SHORT_INFORMATION' : 'MULTI_ITEM_INFORMATION',
    },
  ]));
  const mapped = buildGroupInputs({ jobId: 'run-1', keycode: 'abc', questionScores });
  assert.equal(JSON.parse(mapped.questions_json).length, 6);
  delete questionScores.s_q10;
  assert.throws(
    () => buildGroupInputs({ jobId: 'run-1', keycode: 'abc', questionScores }),
    /s_q10 score is required/
  );
});

test('consumes progressive events and the final seven-component result', async () => {
  const progress = {
    schema_version: 'respond-questions-progress-event-v1',
    event_type: 'SCORE_READY', job_id: 'run-1', question_id: 's_q7', sequence: 1,
    data: { question_score_rounded: 2 },
  };
  const finalResult = {
    schema_version: 'respond-questions-question-result-v1',
    job_id: 'run-1', keycode: 'ABC', question_id: 's_q7',
    group_code: 'RESPOND_TO_QUESTIONS', response_profile: 'EXTENDED_RESPONSE',
    status: 'COMPLETED', pronunciation_score: 2, intonation_fluency_score: 2,
    grammar_score: 2, vocabulary_score: 2, cohesion_score: 2,
    relevance_score: 3, completeness_score: 3,
    question_score_raw: 16 / 7, question_score_rounded: 2, zero_reason: null,
    rule_signals: {}, applied_rules: [], errors: [],
    comment: {
      strength: 'Bạn đã trả lời đúng trọng tâm.',
      improvement: 'Bạn có thể phát triển thêm chi tiết.',
      action: 'Hãy thêm một lý do và một ví dụ cụ thể.',
    },
    versions: {},
  };
  const sse = frame => `data: ${JSON.stringify(frame)}\n\n`;
  const stream = Readable.from([
    sse({
      event: 'node_finished', task_id: 'task-1', workflow_run_id: 'wf-1',
      data: { outputs: { score_event_json: JSON.stringify(progress) } },
    }),
    sse({
      event: 'workflow_finished', task_id: 'task-1', workflow_run_id: 'wf-1',
      data: {
        status: 'succeeded', outputs: { result_json: JSON.stringify(finalResult) },
        input_tokens: 900, output_tokens: 220, total_tokens: 1120,
      },
    }),
  ]);
  const client = createIigExtendedSpeakingDifyClient({
    httpClient: { post: async () => ({ data: stream }) },
  });
  const received = [];
  const output = await client.score({
    endpoint: 'https://dify.example/v1', apiKey: 'secret',
    input: {
      jobId: 'run-1', keycode: 'abc', scorerType: 'RESPOND_TO_QUESTIONS',
      questionNumber: 7, questionText: 'What do you do to stay healthy?',
      transcript: 'I exercise regularly because it helps me stay healthy.',
      audioUrl: 'https://media.example/q7.mp3',
    },
    onProgress: value => received.push(value.eventType),
  });
  assert.deepEqual(received, ['SCORE_READY', 'QUESTION_COMPLETED']);
  assert.equal(output.result.questionScoreRounded, 2);
  assert.equal(output.usage.totalTokens, 1120);
});
