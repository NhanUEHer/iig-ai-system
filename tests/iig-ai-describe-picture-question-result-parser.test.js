const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DescribePictureQuestionOutputError,
  parseDescribePictureQuestionResult,
  parseDescribePictureProgressEvent,
} = require('../src/modules/iig-ai-scoring/describePictureQuestionResultParser');

function result(overrides = {}) {
  return {
    schema_version: 'describe-picture-question-result-v1',
    job_id: 'run-1',
    keycode: 'ABC123',
    question_id: 's_q3',
    group_code: 'DESCRIBE_PICTURE',
    status: 'COMPLETED',
    pronunciation_score: 2,
    intonation_fluency_score: 2,
    grammar_score: 3,
    vocabulary_score: 2,
    cohesion_score: 3,
    question_score_raw: 2.4,
    question_score_rounded: 2,
    zero_reason: null,
    rule_signals: { subject_count_band: 'TWO', central_subject_covered: true },
    applied_rules: [],
    errors: [{
      error_type: 'VOCABULARY', severity: 'LOW', count: 1,
      evidence: 'thing', message_vi: 'Từ vựng còn chung chung.',
    }],
    comment: {
      strength: 'Bạn mô tả đúng nội dung chính của tranh.',
      improvement: 'Từ vựng còn khá chung chung.',
      action: 'Hãy luyện gọi tên chính xác đồ vật và hành động trong tranh.',
      text: 'Bạn mô tả đúng nội dung chính của tranh. Từ vựng còn khá chung chung. Hãy luyện gọi tên chính xác đồ vật và hành động trong tranh.',
    },
    versions: { score_prompt_version: 'describe-picture-score-v1' },
    ...overrides,
  };
}

test('parses a complete Q3/Q4 result with five component scores', () => {
  const parsed = parseDescribePictureQuestionResult(JSON.stringify(result()), {
    jobId: 'run-1', keycode: 'ABC123', questionId: 's_q3',
  });
  assert.equal(parsed.questionScoreRounded, 2);
  assert.equal(parsed.grammarScore, 3);
  assert.equal(parsed.errors[0].errorType, 'VOCABULARY');
});

test('keeps distinct errors of the same type, removes exact duplicates, and validates arithmetic', () => {
  const first = result().errors[0];
  const second = {
    error_type: 'VOCABULARY', severity: 'MEDIUM', count: 1,
    evidence: 'person', message_vi: 'Từ chỉ người còn thiếu chính xác.',
  };
  const parsed = parseDescribePictureQuestionResult(result({
    errors: [first, second, { ...first }],
  }));
  assert.equal(parsed.errors.length, 2);
  assert.deepEqual(parsed.errors.map(item => item.evidence), ['thing', 'person']);
  assert.throws(
    () => parseDescribePictureQuestionResult(result({ question_score_raw: 2.5 })),
    /internally inconsistent/
  );
});

test('parses progressive events only for Q3/Q4 and canonical sequence', () => {
  const parsed = parseDescribePictureProgressEvent({
    schema_version: 'describe-picture-progress-event-v1',
    event_type: 'ERRORS_READY', job_id: 'run-1', question_id: 's_q4',
    sequence: 2, data: { errors: [] },
  });
  assert.equal(parsed.sequence, 2);
  assert.throws(() => parseDescribePictureProgressEvent({
    schema_version: 'describe-picture-progress-event-v1',
    event_type: 'ERRORS_READY', job_id: 'run-1', question_id: 's_q2',
    sequence: 2, data: {},
  }), /s_q3 or s_q4/);
});
