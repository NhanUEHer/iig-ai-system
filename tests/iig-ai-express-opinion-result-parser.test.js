const assert = require('node:assert/strict');
const test = require('node:test');
const {
  parseExpressOpinionQuestionResult,
} = require('../src/modules/iig-ai-scoring/expressOpinionQuestionResultParser');

function result(overrides = {}) {
  return {
    schema_version: 'express-opinion-question-result-v1',
    job_id: 'run-1', keycode: 'ABC', question_id: 's_q11',
    group_code: 'EXPRESS_AN_OPINION', response_profile: 'EXTENDED_OPINION',
    status: 'COMPLETED', pronunciation_score: 4, intonation_fluency_score: 4,
    grammar_score: 3, vocabulary_score: 4, cohesion_score: 3,
    relevance_score: 5, completeness_score: 4,
    holistic_score_preliminary: 4, question_score_final: 4, zero_reason: null,
    rule_signals: {
      stance_status: 'CLEAR', prompt_alignment_ratio: 0.95, reason_count: 2,
      developed_reason_count: 1, example_count: 1, support_development: 'ADEQUATE',
      copied_prompt_only: false, completely_unrelated: false,
      cut_off: false, excessive_fillers: false,
    },
    applied_rules: [], errors: [],
    comment: {
      strength: 'Bạn nêu quan điểm rõ ràng và đúng trọng tâm.',
      improvement: 'Một lý do vẫn cần được phát triển cụ thể hơn.',
      action: 'Hãy bổ sung ví dụ trực tiếp cho từng lý do.',
    },
    versions: { rubric_version: 'v1' }, ...overrides,
  };
}

test('accepts a holistic Q11 score independent from component arithmetic mean', () => {
  const parsed = parseExpressOpinionQuestionResult(result(), {
    jobId: 'run-1', keycode: 'ABC', scorerType: 'EXPRESS_AN_OPINION', questionNumber: 11,
  });
  assert.equal(parsed.questionScoreFinal, 4);
  assert.equal(parsed.holisticScorePreliminary, 4);
  assert.equal(parsed.relevanceScore, 5);
});

test('requires every score to be zero when a zero reason is returned', () => {
  assert.throws(() => parseExpressOpinionQuestionResult(result({
    question_score_final: 0, zero_reason: 'COMPLETELY_UNRELATED',
  }), { scorerType: 'EXPRESS_AN_OPINION', questionNumber: 11 }), /All component/);
});

test('consolidates duplicate diagnostic error types', () => {
  const parsed = parseExpressOpinionQuestionResult(result({ errors: [
    { error_type: 'GRAMMAR', severity: 'LOW', count: 1, evidence: 'is agree', message_vi: 'Sai cấu trúc.' },
    { error_type: 'GRAMMAR', severity: 'HIGH', count: 2, evidence: 'people is', message_vi: 'Nhiều lỗi ngữ pháp ảnh hưởng độ rõ.' },
  ] }), { scorerType: 'EXPRESS_AN_OPINION', questionNumber: 11 });
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.errors[0].count, 3);
  assert.equal(parsed.errors[0].severity, 'HIGH');
});
