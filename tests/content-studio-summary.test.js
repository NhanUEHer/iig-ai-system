const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deriveNextAction,
  deriveTaskStatus,
  rollupStatus,
} = require('../src/modules/content-studio/summaryService');

test('status roll-up uses failed, generating, needs-review, ready priority', () => {
  assert.equal(rollupStatus(['ready', 'needs_review']), 'needs_review');
  assert.equal(rollupStatus(['needs_review', 'queued']), 'generating');
  assert.equal(rollupStatus(['generating', 'failed', 'ready']), 'failed');
  assert.equal(rollupStatus([]), null);
});

test('task status is null when not requested and aggregates question artifacts', () => {
  const taskStatus = deriveTaskStatus(
    { passage: ['vocab', 'dictionary'], question: ['translation', 'hint'] },
    [
      { type: 'vocab', status: 'ready' },
      { type: 'dictionary', status: 'queued' },
      { type: 'question_pack', status: 'ready' },
      { type: 'question_pack', status: 'needs_review' },
    ],
  );
  assert.deepEqual(taskStatus, {
    vocab: 'ready',
    dictionary: 'generating',
    translation: null,
    questions: 'needs_review',
  });
});

test('next action directs dictionary review, content review, or open', () => {
  assert.deepEqual(deriveNextAction({ dictionary: 'waiting_review', questions: 'needs_review' }), {
    nextAction: 'review_dictionary', nextLabel: 'Duyệt danh sách từ',
  });
  assert.deepEqual(deriveNextAction({ dictionary: 'ready', questions: 'failed' }), {
    nextAction: 'review', nextLabel: 'Xem lại',
  });
  assert.deepEqual(deriveNextAction({ vocab: 'ready', dictionary: null, translation: 'generating' }), {
    nextAction: 'open', nextLabel: 'Mở',
  });
});
