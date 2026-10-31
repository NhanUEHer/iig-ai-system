const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parseExtendedSpeakingQuestionResult,
} = require('../src/modules/iig-ai-scoring/extendedSpeakingQuestionResultParser');

function result(overrides = {}) {
  return {
    schema_version: 'respond-questions-question-result-v1',
    job_id: 'run-1',
    keycode: 'TEST',
    question_id: 's_q7',
    group_code: 'RESPOND_TO_QUESTIONS',
    response_profile: 'EXTENDED_RESPONSE',
    status: 'COMPLETED',
    pronunciation_score: 2,
    intonation_fluency_score: 2,
    grammar_score: 2,
    vocabulary_score: 3,
    cohesion_score: 2,
    relevance_score: 3,
    completeness_score: 3,
    question_score_raw: 17 / 7,
    question_score_rounded: 2,
    zero_reason: null,
    rule_signals: { subquestions_total: 2, subquestions_answered: 2 },
    applied_rules: [],
    errors: [
      {
        error_type: 'GRAMMAR', severity: 'LOW', count: 1,
        evidence: ['I go yesterday'], message_vi: 'Bạn cần chú ý thì của động từ.',
      },
      {
        error_type: 'GRAMMAR', severity: 'MEDIUM', count: 1,
        evidence: ['She go'], message_vi: 'Bạn cần kiểm tra sự hòa hợp chủ ngữ và động từ.',
      },
    ],
    comment: {
      strength: 'Bạn đã trả lời đúng trọng tâm.',
      improvement: 'Bạn cần cải thiện ngữ pháp.',
      action: 'Hãy luyện phát triển câu trả lời bằng một ví dụ.',
    },
    versions: { score_prompt_version: 'respond-questions-score-v1' },
    ...overrides,
  };
}

test('parses seven component scores and consolidates duplicate error types', () => {
  const parsed = parseExtendedSpeakingQuestionResult(result(), {
    scorerType: 'RESPOND_TO_QUESTIONS',
    questionNumber: 7,
    jobId: 'run-1',
    keycode: 'TEST',
  });
  assert.equal(parsed.responseProfile, 'EXTENDED_RESPONSE');
  assert.equal(parsed.questionScoreRaw, 17 / 7);
  assert.equal(parsed.questionScoreRounded, 2);
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.errors[0].count, 2);
  assert.equal(parsed.errors[0].severity, 'MEDIUM');
  assert.deepEqual(parsed.errors[0].evidence, ['I go yesterday', 'She go']);
});

test('rejects inconsistent average and a mismatched response profile', () => {
  assert.throws(
    () => parseExtendedSpeakingQuestionResult(result({ question_score_raw: 3 }), {
      scorerType: 'RESPOND_TO_QUESTIONS', questionNumber: 7,
    }),
    /internally inconsistent/
  );
  assert.throws(
    () => parseExtendedSpeakingQuestionResult(result({ response_profile: 'SHORT_DIRECT_RESPONSE' }), {
      scorerType: 'RESPOND_TO_QUESTIONS', questionNumber: 7,
    }),
    /response_profile/
  );
});

test('accepts Q10 information profile and its specialized errors', () => {
  const parsed = parseExtendedSpeakingQuestionResult(result({
    schema_version: 'respond-information-question-result-v1',
    question_id: 's_q10',
    group_code: 'RESPOND_USING_INFORMATION',
    response_profile: 'MULTI_ITEM_INFORMATION',
    errors: [{
      error_type: 'FACTUAL_ACCURACY', severity: 'HIGH', count: 1,
      evidence: '9:30 instead of 10:30', message_vi: 'Bạn đã nêu sai thời gian.',
    }],
  }), {
    scorerType: 'RESPOND_USING_INFORMATION',
    questionNumber: 10,
  });
  assert.equal(parsed.questionId, 's_q10');
  assert.equal(parsed.errors[0].errorType, 'FACTUAL_ACCURACY');
});
