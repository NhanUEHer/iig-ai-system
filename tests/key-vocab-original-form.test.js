const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizeVocabulary } = require('../src/modules/key-vocab/keyVocabService');

test('key vocab preserves exact source form separately from canonical form', () => {
  const passage = 'The company implemented revised procedures yesterday.';
  const [item] = normalizeVocabulary({ w: [{
    o: 'implemented', t: 'implement', p: 'Verb', i: '/ˈɪmplɪment/', m: 'triển khai'
  }] }, { passage });
  assert.deepEqual(item, {
    o: 'implemented', t: 'implement', p: 'Verb', i: '/ˈɪmplɪment/', m: 'triển khai'
  });
});

test('key vocab rejects an original form not present exactly in the passage', () => {
  assert.throws(() => normalizeVocabulary({ w: [{
    o: 'implement', t: 'implement', p: 'Verb', i: '/ˈɪmplɪment/', m: 'triển khai'
  }] }, { passage: 'The company implemented the policy.' }), error => error.code === 'VOCAB_NOT_IN_PASSAGE');
});
