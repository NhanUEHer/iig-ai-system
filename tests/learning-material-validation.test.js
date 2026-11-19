const test = require('node:test');
const assert = require('node:assert/strict');
const { containsTerm, findTerm } = require('../src/modules/learning-materials/textMatch');
const { normalizeEntryResults, containsExactTerm } = require('../src/modules/dictionary/dictionaryService');
const { normalizeVocabulary } = require('../src/modules/key-vocab/keyVocabService');

const SENTENCE = 'SYDNEY – Over ten thousand people ---[1]--- last night’s rock concert, as reported by the event’s organizer.';

test('terms match across curly/straight quotes, dashes and spacing, but not inside words', () => {
  assert.equal(containsExactTerm(SENTENCE, "night's"), true);
  assert.equal(containsTerm(SENTENCE, "event's"), true);
  assert.equal(findTerm(SENTENCE, "night's"), 'night’s');
  assert.equal(findTerm(SENTENCE, 'rock   concert'), 'rock concert');
  assert.equal(containsTerm(SENTENCE, 'conc'), false);
  assert.equal(containsTerm(SENTENCE, 'stadium'), false);
});

const entry = (canonical, overrides = {}) => ({
  canonical, pos: 'Noun', ipa: '/x/', meaning_vn: 'nghĩa', meaning_en: 'Meaning.',
  context_analysis: { original_sentence: 'Different echo of the sentence.', explanation: '' },
  usage: { example: { en: '', vn: '' }, collocations: [], synonyms: [], word_family: '' }, ...overrides,
});

test('one incomplete dictionary entry fails only its own word', () => {
  const results = normalizeEntryResults({ output: { dictionary_entries: [entry('people'), entry('concert', { meaning_vn: '' })] }, callId: 'c1' }, ['people', 'concert']);
  assert.equal(results[0].entry.canonical, 'people');
  assert.equal(results[0].entry.workflowRunId, 'c1');
  assert.equal(results[1].error.code, 'INVALID_DICTIONARY_ENTRY');
  assert.match(results[1].error.message, /concert.*nghĩa tiếng Việt/);
  assert.ok(results[1].rawResponse);
});

test('a dictionary batch with the wrong size still fails as a whole', () => {
  assert.throws(() => normalizeEntryResults({ output: { dictionary_entries: [entry('people')] } }, ['people', 'concert']),
    error => error.code === 'DICTIONARY_BATCH_SIZE_MISMATCH');
});

const PASSAGE = 'Over ten thousand people attended last night’s rock concert, as reported by the event’s organizer and staff.';
const vocab = (o, overrides = {}) => ({ o, t: o, p: 'Noun', i: '/x/', m: 'nghĩa', ...overrides });

test('fresh Key Vocab output keeps valid rows and reports the bad ones', () => {
  const skipped = [];
  const items = normalizeVocabulary({ w: [vocab("night's"), vocab('stadium'), vocab('organizer', { m: '' }), vocab('concert', { p: 'noun', i: 'ˈkɒnsət' }), vocab('concert')] },
    { passage: PASSAGE, lenient: true, skipped });
  assert.deepEqual(items.map(item => item.o), ['night’s', 'concert']);
  assert.equal(items[1].p, 'Noun');
  assert.equal(items[1].i, '/ˈkɒnsət/');
  assert.equal(skipped.length, 2);
  assert.match(skipped.join('\n'), /stadium/);
  assert.match(skipped.join('\n'), /organizer.*nghĩa tiếng Việt/);
});

test('saving Key Vocab stays strict and names the offending word', () => {
  assert.throws(() => normalizeVocabulary({ w: [vocab('concert'), vocab('stadium')] }, { passage: PASSAGE }),
    error => error.code === 'VOCAB_NOT_IN_PASSAGE' && /stadium/.test(error.message));
  assert.throws(() => normalizeVocabulary({ w: [vocab('concert'), vocab('Concert')] }, { passage: PASSAGE }),
    error => error.code === 'DUPLICATE_VOCAB_ITEM');
});
