'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mapDictionaryEntries,
  normalizeExtract,
  sameSentence,
  sentenceBelongsToPassage,
  splitWordFamily,
} = require('../src/modules/content-studio/dictionary/normalize');
const { deriveTaskStatus } = require('../src/modules/content-studio/summaryService');
const mock = require('../src/modules/content-studio/generation/mockProvider');
const fixtures = require('../src/modules/content-studio/generation/mockFixtures');
const { validateEntry } = require('../src/modules/content-studio/dictionary/normalize');

const sentence = 'The finance advisor will also attend the meeting.';
const passage = `Please confirm the date. ${sentence}`;

test('extract normalization validates sentences and de-duplicates chunks per sentence', () => {
  const rows = normalizeExtract({ sentences: [{
    sentence_text: `  ${sentence}  `,
    items: [{ original_chunk: 'finance advisor' }, { original_chunk: 'finance advisor' }, 'meeting'],
  }] }, passage);
  assert.deepEqual(rows, [{ sentenceText: sentence, items: ['finance advisor', 'meeting'] }]);
  assert.equal(sentenceBelongsToPassage(passage, sentence), true);
  assert.equal(sameSentence('Hello  –  world.', 'hello–world.'), true);
});

test('extract normalization rejects a sentence outside the passage', () => {
  assert.throws(() => normalizeExtract({ sentences: [{
    sentence_text: 'This sentence is not in the source.', items: ['sentence'],
  }] }, passage), error => error.code === 'DICTIONARY_SENTENCE_NOT_IN_PASSAGE');
});

test('batch mapping rejects size and context sentence mismatches', () => {
  assert.throws(() => mapDictionaryEntries({ dictionary_entries: [] }, ['advisor'], sentence),
    error => error.code === 'DICTIONARY_BATCH_SIZE_MISMATCH');
  assert.throws(() => mapDictionaryEntries({ dictionary_entries: [{
    canonical: 'advisor', meaning_vn: 'cố vấn', meaning_en: 'a person who advises',
    context_analysis: { original_sentence: 'A different sentence.', explanation: 'x' },
    usage: { example: { en: 'An advisor helped.', vn: 'Một cố vấn đã giúp.' } },
  }] }, ['advisor'], sentence), error => error.code === 'DICTIONARY_CONTEXT_MISMATCH');
});

test('word-family strings split on spaced hyphen and en dash', () => {
  assert.deepEqual(splitWordFamily('advise (v) - advisor (n) – advisory (adj)'), [
    'advise (v)', 'advisor (n)', 'advisory (adj)',
  ]);
  assert.deepEqual(splitWordFamily('advise (v)–advisor (n)'), ['advise (v)', 'advisor (n)']);
  assert.deepEqual(splitWordFamily(['advise (v)', '', 'advisor (n)']), ['advise (v)', 'advisor (n)']);
});

test('dictionary task status comes from the new dictionary roll-up', () => {
  const tasks = { passage: ['dictionary'], question: [] };
  assert.equal(deriveTaskStatus(tasks, [{ type: 'dictionary', status: 'ready' }], { dictionaryStatus: 'draft' }).dictionary, 'waiting_review');
  assert.equal(deriveTaskStatus(tasks, [{ type: 'dictionary', status: 'failed' }], { dictionaryStatus: 'ready' }).dictionary, 'ready');
  assert.equal(deriveTaskStatus(tasks, [], { dictionaryStatus: 'needs_review' }).dictionary, 'needs_review');
});

test('sample dictionary mock extracts and maps fourteen ready entries', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { detectContent } = require('../src/modules/content-studio/detect/detectContent');
  const source = fs.readFileSync(path.join(__dirname, 'fixtures/content-studio-letter.txt'), 'utf8');
  const detected = detectContent(source);
  const sourceSentences = require('../src/modules/content-studio/detect/detectContent').splitSentences(detected.segments[0].text);
  assert.equal(sourceSentences.length, fixtures.DICTIONARY.length);
  const extracted = await mock.generate('dictionary_extract', { passage: detected.segments[0].text, sentences: sourceSentences });
  const rows = normalizeExtract(extracted, detected.segments[0].text);
  const entries = [];
  for (const row of rows) {
    const raw = await mock.generate('dictionary_entries', {
      passage: detected.segments[0].text, sentences: sourceSentences,
      sentence: row.sentenceText, targetChunks: row.items,
    });
    entries.push(...mapDictionaryEntries(raw, row.items, row.sentenceText)
      .map(entry => validateEntry(entry, row.sentenceText)));
  }
  assert.equal(entries.length, 14);
  assert.equal(entries.every(entry => entry.validation.issues.length === 0), true);
});
