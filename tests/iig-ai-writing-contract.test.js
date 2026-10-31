const assert = require('node:assert/strict');
const test = require('node:test');

const { PROFILES, profileForScorerType, validateWritingQuestion } = require(
  '../src/modules/iig-ai-scoring/writingProfiles'
);
const {
  parseWritingQuestionResult,
} = require('../src/modules/iig-ai-scoring/writingQuestionResultParser');
const {
  buildDifyInputs,
  createIigWritingDifyClient,
} = require('../src/clients/iigWritingDifyClient');

function result(overrides = {}) {
  return {
    schema_version: 'writing-question-result-v1',
    job_id: 'run-1',
    keycode: 'ABC123',
    question_id: 'w_q6',
    question_number: 6,
    group_code: 'RESPOND_TO_WRITTEN_REQUEST',
    status: 'COMPLETED',
    component_scores: {
      task_fulfillment: 3,
      sentence_quality: 3,
      vocabulary: 2,
      organization: 3,
    },
    question_score_raw: 2.75,
    question_score_rounded: 3,
    zero_reason: null,
    rule_signals: { word_count: 91 },
    applied_rules: [],
    errors: [{
      error_type: 'VOCABULARY', severity: 'LOW', count: 1,
      evidence: ['make a meeting'], message_vi: 'Cách dùng từ chưa tự nhiên.',
    }],
    comment: {
      strength: 'Bạn đã trả lời đúng mục đích.',
      improvement: 'Bạn cần dùng từ tự nhiên hơn.',
      action: 'Hãy luyện các cụm từ dùng trong email.',
      text: 'Bạn đã trả lời đúng mục đích. Bạn cần dùng từ tự nhiên hơn. Hãy luyện các cụm từ dùng trong email.',
    },
    versions: { rubric_version: 'v1' },
    ...overrides,
  };
}

test('Writing profiles isolate the three official question ranges', () => {
  assert.equal(PROFILES.WRITE_SENTENCE_PICTURE.scoreMax, 3);
  assert.equal(PROFILES.WRITE_SENTENCE_PICTURE.envPrefix, 'IIG_AI_WRITE_SENTENCE_PICTURE');
  assert.equal(PROFILES.WRITE_SENTENCE_PICTURE.defaultPromptVersion, 'write-sentence-picture-v2');
  assert.equal(PROFILES.RESPOND_TO_WRITTEN_REQUEST.scoreMax, 4);
  assert.equal(
    PROFILES.RESPOND_TO_WRITTEN_REQUEST.defaultPromptVersion,
    'respond-written-request-score-v2'
  );
  assert.equal(PROFILES.WRITE_OPINION_ESSAY.scoreMax, 5);
  assert.equal(
    PROFILES.WRITE_OPINION_ESSAY.defaultPromptVersion,
    'write-opinion-essay-score-v2'
  );
  assert.equal(validateWritingQuestion('WRITE_SENTENCE_PICTURE', 5), 5);
  assert.throws(() => validateWritingQuestion('WRITE_SENTENCE_PICTURE', 6));
  assert.throws(() => profileForScorerType('READ_TEXT_ALOUD'));
});

test('Writing parser accepts the canonical Q6 result and normalizes errors', () => {
  const parsed = parseWritingQuestionResult(result({
    errors: [
      result().errors[0],
      { ...result().errors[0], severity: 'MEDIUM', count: 2, evidence: ['do a meeting'] },
    ],
  }), {
    jobId: 'run-1', keycode: 'ABC123',
    scorerType: 'RESPOND_TO_WRITTEN_REQUEST', questionNumber: 6,
  });
  assert.equal(parsed.questionScoreRounded, 3);
  assert.equal(parsed.componentScores.taskFulfillment, 3);
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.errors[0].count, 3);
  assert.equal(parsed.errors[0].severity, 'MEDIUM');
});

test('Writing parser normalizes a numeric Dify keycode while preserving identity checks', () => {
  const parsed = parseWritingQuestionResult(result({ keycode: 123456 }), {
    jobId: 'run-1', keycode: '123456',
    scorerType: 'RESPOND_TO_WRITTEN_REQUEST', questionNumber: 6,
  });
  assert.equal(parsed.keycode, '123456');
  assert.throws(() => parseWritingQuestionResult(result({ keycode: 123456 }), {
    jobId: 'run-1', keycode: '654321',
    scorerType: 'RESPOND_TO_WRITTEN_REQUEST', questionNumber: 6,
  }), /keycode mismatch/);
});

test('Writing parser uses the locked request keycode when Dify omits its identity echo', () => {
  const parsed = parseWritingQuestionResult(result({ keycode: null }), {
    jobId: 'run-1', keycode: 'LOCKED123',
    scorerType: 'RESPOND_TO_WRITTEN_REQUEST', questionNumber: 6,
  });
  assert.equal(parsed.keycode, 'LOCKED123');
  assert.throws(() => parseWritingQuestionResult(result({ keycode: null }), {
    jobId: 'run-1',
    scorerType: 'RESPOND_TO_WRITTEN_REQUEST', questionNumber: 6,
  }), /keycode is required/);
});

test('Writing parser recovers an omitted group code only from the locked scorer profile', () => {
  const parsed = parseWritingQuestionResult(result({ group_code: null }), {
    jobId: 'run-1', keycode: 'ABC123',
    scorerType: 'RESPOND_TO_WRITTEN_REQUEST', questionNumber: 6,
  });
  assert.equal(parsed.groupCode, 'RESPOND_TO_WRITTEN_REQUEST');
  assert.throws(() => parseWritingQuestionResult(result({ group_code: 'WRITE_OPINION_ESSAY' }), {
    jobId: 'run-1', keycode: 'ABC123',
    scorerType: 'RESPOND_TO_WRITTEN_REQUEST', questionNumber: 6,
  }), /group_code mismatch/);
});

test('Writing parser requires a supported zero reason exactly for zero scores', () => {
  const zero = result({
    question_score_raw: 0,
    question_score_rounded: 0,
    zero_reason: 'BLANK_RESPONSE',
    component_scores: {
      task_fulfillment: 0, sentence_quality: 0, vocabulary: 0, organization: 0,
    },
  });
  assert.equal(parseWritingQuestionResult(zero, {
    scorerType: 'RESPOND_TO_WRITTEN_REQUEST', questionNumber: 6,
  }).zeroReason, 'BLANK_RESPONSE');
  assert.throws(() => parseWritingQuestionResult({ ...zero, zero_reason: null }, {
    scorerType: 'RESPOND_TO_WRITTEN_REQUEST', questionNumber: 6,
  }));
});

test('Writing parser preserves canonical source-data zero lineage', () => {
  const parsed = parseWritingQuestionResult(result({
    question_score_raw: 0,
    question_score_rounded: 0,
    zero_reason: 'CONTEXT_NOT_FOUND',
    scoring_disposition: 'INVALID_PROMPT_SOURCE',
    zero_origin: 'SOURCE_DATA',
    resolution_metadata: { source: 'IIG_BATCH_DETAIL' },
    component_scores: {
      task_fulfillment: 0, sentence_quality: 0, vocabulary: 0, organization: 0,
    },
    errors: [],
  }), {
    scorerType: 'RESPOND_TO_WRITTEN_REQUEST', questionNumber: 6,
  });

  assert.equal(parsed.scoringDisposition, 'INVALID_PROMPT_SOURCE');
  assert.equal(parsed.zeroOrigin, 'SOURCE_DATA');
  assert.deepEqual(parsed.resolutionMetadata, { source: 'IIG_BATCH_DETAIL' });
});

test('Dify input mapping preserves Writing identity and optional picture', () => {
  const { mapped } = buildDifyInputs({
    jobId: 'run-1', keycode: 'abc123', scorerType: 'WRITE_SENTENCE_PICTURE',
    questionNumber: 1, questionText: 'Write one sentence.',
    requiredWords: ['while', 'table'], studentWriting: 'A woman is working while sitting at a table.',
    pictureUrl: 'https://media.example/picture.png', upstreamZeroReason: 'NONE',
  });
  assert.equal(mapped.question_id, 'w_q1');
  assert.equal(mapped.keycode, 'ABC123');
  assert.equal(mapped.picture.type, 'image');
  assert.deepEqual(JSON.parse(mapped.required_words_json), ['while', 'table']);
});

test('Dify input mapping sends Q6-Q7 context image instead of context text', () => {
  const { mapped } = buildDifyInputs({
    jobId: 'run-1', keycode: 'abc123', scorerType: 'RESPOND_TO_WRITTEN_REQUEST',
    questionNumber: 6, questionText: 'Reply to the email and ask two questions.',
    contextText: 'This fallback must not be sent when an image exists.',
    contextImageUrl: 'https://media.example/written-request.png',
    studentWriting: 'Dear Ms. Lee, could we meet next Monday?', upstreamZeroReason: 'NONE',
  });

  assert.equal(mapped.context_mode, 'IMAGE');
  assert.equal(mapped.context, '');
  assert.equal(mapped.context_image.type, 'image');
  assert.equal(mapped.context_image.transfer_method, 'remote_url');
});

test('Dify input mapping falls back to Q6-Q7 context text', () => {
  const { mapped } = buildDifyInputs({
    jobId: 'run-1', keycode: 'abc123', scorerType: 'RESPOND_TO_WRITTEN_REQUEST',
    questionNumber: 7, questionText: 'Reply to the complaint and propose two solutions.',
    contextText: 'A customer reports a damaged television.',
    studentWriting: 'Dear Customer, we can replace the item or issue a refund.',
    upstreamZeroReason: 'NONE',
  });

  assert.equal(mapped.context_mode, 'TEXT');
  assert.equal(mapped.context, 'A customer reports a damaged television.');
  assert.equal(mapped.context_image, undefined);
});

test('Dify input mapping rejects Q6-Q7 without source context', () => {
  assert.throws(() => buildDifyInputs({
    jobId: 'run-1', keycode: 'abc123', scorerType: 'RESPOND_TO_WRITTEN_REQUEST',
    questionNumber: 6, questionText: 'Reply to the email.',
    studentWriting: 'Dear Sir, thank you for your message.', upstreamZeroReason: 'NONE',
  }), /context text or image/);
});

test('Dify input mapping routes missing source context without requiring learner text', () => {
  const { mapped } = buildDifyInputs({
    jobId: 'run-1', keycode: 'abc123', scorerType: 'RESPOND_TO_WRITTEN_REQUEST',
    questionNumber: 6, scoringDisposition: 'INVALID_PROMPT_SOURCE',
    zeroReason: 'CONTEXT_NOT_FOUND', zeroOrigin: 'SOURCE_DATA',
    resolutionMetadata: { source: 'IIG_BATCH_DETAIL' },
  });

  assert.equal(mapped.ai_status, 'ZERO_SCORE');
  assert.equal(mapped.scoring_disposition, 'INVALID_PROMPT_SOURCE');
  assert.equal(mapped.zero_reason, 'CONTEXT_NOT_FOUND');
  assert.equal(mapped.zero_origin, 'SOURCE_DATA');
  assert.deepEqual(JSON.parse(mapped.resolution_metadata_json), { source: 'IIG_BATCH_DETAIL' });
});

test('Dify client parses a mocked canonical response without a live workflow', async () => {
  const client = createIigWritingDifyClient({
    httpClient: {
      post: async () => ({ data: { data: {
        status: 'succeeded', workflow_run_id: 'dify-run-1',
        outputs: { result_json: JSON.stringify(result()) },
        total_tokens: 432,
      } } }),
    },
  });
  const output = await client.score({
    endpoint: 'https://dify.example/v1', apiKey: 'test-key', requestId: 'model-run-1',
    input: {
      jobId: 'run-1', keycode: 'ABC123', scorerType: 'RESPOND_TO_WRITTEN_REQUEST',
      questionNumber: 6, questionText: 'Reply to the request.',
      contextText: 'The sender asks for two available meeting dates.',
      studentWriting: 'Dear Sir, I would like to suggest two available dates.',
      upstreamZeroReason: 'NONE',
    },
  });
  assert.equal(output.workflowStatus, 'succeeded');
  assert.equal(output.result.questionScoreRounded, 3);
  assert.equal(output.usage.totalTokens, 432);
});
