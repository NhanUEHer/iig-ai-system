const test = require('node:test');
const assert = require('node:assert/strict');
const { passageHash, questionHash } = require('../src/modules/content-studio/sourceHash');
const { markStale, dictionarySentencesStale, staleSummary } = require('../src/modules/content-studio/contentStudioService');

const passage = { id: 'p1', kind: 'passage', position: 0, text: 'One sentence here. Two sentence here.' };
const set = { id: 's1', kind: 'question_set', position: 1, meta: { passageIndex: 0 } };
const question = { id: 'q1', segmentId: 's1', stem: 'Why?', options: { A: 'a', B: 'b' }, answerKey: 'B' };

test('fingerprints ignore whitespace but change with content, options and answer key', () => {
  assert.equal(passageHash('One  sentence.\n'), passageHash('One sentence.'));
  assert.notEqual(passageHash('One sentence.'), passageHash('One sentences.'));
  assert.notEqual(questionHash('P', question), questionHash('P', { ...question, answerKey: 'A' }));
  assert.notEqual(questionHash('P', question), questionHash('P', { ...question, options: { A: 'a', B: 'c' } }));
});

test('passage edit makes vocab, translation and question packs stale; legacy artifacts without hash are never stale', () => {
  const oldHash = passageHash('Old text.');
  const artifacts = [
    { type: 'vocab', segmentId: 'p1', content: {}, sourceHash: oldHash },
    { type: 'passage_translation', segmentId: 'p1', content: {}, sourceHash: passageHash(passage.text) },
    { type: 'question_pack', questionId: 'q1', content: {}, sourceHash: questionHash('Old text.', question) },
    { type: 'vocab', segmentId: 'p1', content: {}, sourceHash: null },
  ];
  markStale([passage, set], [question], artifacts);
  assert.deepEqual(artifacts.map(a => a.stale), [true, false, true, false]);
  assert.ok(artifacts.every(a => !('sourceHash' in a)));
  assert.deepEqual(staleSummary(artifacts, 0), [{ part: 'vocab', count: 1 }, { part: 'questions', count: 1 }]);
});

test('dictionary staleness counts only added/removed sentences', () => {
  const stored = [{ segmentId: 'p1', text: 'One sentence here.' }, { segmentId: 'p1', text: 'Old sentence.' }];
  assert.equal(dictionarySentencesStale([passage], stored), 2); // "Two…" added, "Old…" removed
  assert.equal(dictionarySentencesStale([passage], []), 0);
});
