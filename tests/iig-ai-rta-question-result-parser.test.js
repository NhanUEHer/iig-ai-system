const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RtaQuestionOutputError,
  parseRtaQuestionResult,
  parseRtaProgressEvent,
} = require('../src/modules/iig-ai-scoring/rtaQuestionResultParser');

function result(overrides = {}) {
  return {
    schema_version: 'rta-question-result-v1',
    job_id: 'run-1',
    keycode: 'ABC123',
    question_id: 's_q1',
    group_code: 'READ_TEXT_ALOUD',
    status: 'COMPLETED',
    pronunciation_score: 2,
    intonation_stress_score: 3,
    question_score_raw: 2.5,
    question_score_rounded: 3,
    zero_reason: null,
    rule_signals: { completion_ratio: 0.95 },
    errors: [{
      error_type: 'PRONUNCIATION', severity: 'MEDIUM', count: 1,
      evidence: 'promotional', message_vi: 'Một từ phát âm chưa rõ.',
    }],
    comment: {
      strength: 'Bạn đọc khá rõ.',
      improvement: 'Một số từ cần chính xác hơn.',
      action: 'Hãy luyện lại từ khó.',
      text: 'Bạn đọc khá rõ. Một số từ cần chính xác hơn. Hãy luyện lại từ khó.',
    },
    versions: { score_prompt_version: 'rta-score-v2' },
    ...overrides,
  };
}

test('parses one complete RTA Q1/Q2 result and normalizes field names', () => {
  const parsed = parseRtaQuestionResult(JSON.stringify(result()), {
    jobId: 'run-1', keycode: 'ABC123', questionId: 's_q1',
  });
  assert.equal(parsed.questionScoreRounded, 3);
  assert.equal(parsed.errors[0].errorType, 'PRONUNCIATION');
  assert.equal(parsed.comment.action, 'Hãy luyện lại từ khó.');
});

test('keeps distinct errors of the same type and removes only exact duplicates', () => {
  const first = result().errors[0];
  const second = {
    error_type: 'PRONUNCIATION', severity: 'LOW', count: 1,
    evidence: 'department', message_vi: 'Âm cuối của từ chưa rõ.',
  };
  const parsed = parseRtaQuestionResult(result({ errors: [first, second, { ...first }] }));
  assert.equal(parsed.errors.length, 2);
  assert.deepEqual(parsed.errors.map(item => item.evidence), ['promotional', 'department']);
});

test('rejects inconsistent score arithmetic and identity mismatches', () => {
  assert.throws(
    () => parseRtaQuestionResult(result({ question_score_rounded: 2 })),
    error => error instanceof RtaQuestionOutputError
  );
  assert.throws(
    () => parseRtaQuestionResult(result(), { questionId: 's_q2' }),
    /question_id does not match/
  );
});

test('parses progressive events only with their canonical sequence', () => {
  const parsed = parseRtaProgressEvent({
    schema_version: 'rta-progress-event-v1', event_type: 'SCORE_READY',
    job_id: 'run-1', question_id: 's_q1', sequence: 1,
    data: { question_score_rounded: 3 },
  }, { jobId: 'run-1', questionId: 's_q1' });
  assert.equal(parsed.sequence, 1);
  assert.throws(() => parseRtaProgressEvent({
    schema_version: 'rta-progress-event-v1', event_type: 'SCORE_READY',
    job_id: 'run-1', question_id: 's_q1', sequence: 2, data: {},
  }), /type and sequence/);
});
