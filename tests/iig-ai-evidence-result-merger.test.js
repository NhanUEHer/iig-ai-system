const assert = require('node:assert/strict');
const test = require('node:test');

const { mergeEvidence } = require('../src/modules/iig-ai-scoring/evidenceResultMerger');

function features(completion) {
  return {
    schemaVersion: 2,
    featureVersion: 'iig-ai-evidence-v1',
    completion,
    task: { profile: 'RESPOND_TO_QUESTIONS', deterministic: { wordCount: 12 } },
  };
}

test('speech and semantic evidence merge independently before scoring becomes ready', () => {
  const initial = features({ deterministic: 'READY', speech: 'PENDING', taskSemantic: 'PENDING' });
  const speech = mergeEvidence(initial, 'SPEECH_EVIDENCE', {
    schemaVersion: 1,
    status: 'SUCCESS',
  });
  assert.equal(speech.ready, false);
  assert.equal(speech.features.completion.speech, 'READY');
  assert.equal(speech.features.completion.taskSemantic, 'PENDING');
  assert.equal(initial.completion.speech, 'PENDING');

  const semantic = mergeEvidence(speech.features, 'TASK_EVIDENCE', {
    schemaVersion: 1,
    status: 'SUCCESS',
    evidence: { relevance: 'STRONG' },
  });
  assert.equal(semantic.ready, true);
  assert.equal(semantic.features.completion.taskSemantic, 'READY');
  assert.deepEqual(semantic.features.task.semantic.evidence, { relevance: 'STRONG' });
});

test('writing becomes ready after semantic evidence without speech evidence', () => {
  const initial = features({ deterministic: 'READY', speech: 'NOT_REQUIRED', taskSemantic: 'PENDING' });
  const merged = mergeEvidence(initial, 'TASK_EVIDENCE', {
    schemaVersion: 1,
    status: 'SUCCESS',
  });
  assert.equal(merged.ready, true);
  assert.equal(merged.features.completion.speech, 'NOT_REQUIRED');
});

test('merger rejects stages that the feature plan marked not required', () => {
  const initial = features({ deterministic: 'READY', speech: 'NOT_REQUIRED', taskSemantic: 'PENDING' });
  assert.throws(
    () => mergeEvidence(initial, 'SPEECH_EVIDENCE', { status: 'SUCCESS' }),
    error => error.code === 'IIG_AI_EVIDENCE_STAGE_UNEXPECTED'
  );
});
