const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeExtracted, normalizeEntry, maxItems } = require('../src/modules/dictionary/dictionaryService');

test('normalizeExtracted accepts Dify structured output and removes duplicates', () => {
  const raw = { data: { outputs: { structured_output: [' Deadline ', 'deadline', 'eligible for payment'] } } };
  assert.deepEqual(normalizeExtracted(raw), ['Deadline', 'eligible for payment']);
});

test('dictionary extraction keeps up to the configurable item limit', () => {
  const previous = process.env.DICTIONARY_MAX_ITEMS;
  process.env.DICTIONARY_MAX_ITEMS = '300';
  try {
    const items = Array.from({ length: 320 }, (_, index) => `item-${index + 1}`);
    assert.equal(maxItems(), 300);
    assert.equal(normalizeExtracted({ data: { outputs: { structured_output: items } } }).length, 300);
  } finally {
    if (previous === undefined) delete process.env.DICTIONARY_MAX_ITEMS;
    else process.env.DICTIONARY_MAX_ITEMS = previous;
  }
});

test('normalizeEntry maps current Dify dictionary contract', () => {
  const raw = { data: { id: 'run-1', outputs: { structured_output: {
    original_chunk: 'eligible for payment', canonical: 'eligible', pos: 'Adjective', ipa: '/test/', meaning_vn: 'đủ điều kiện', meaning_en: 'qualified',
    context_analysis: { original_sentence: 'They are eligible for payment.', explanation: 'Đủ điều kiện nhận tiền.' },
    example: { en: 'She is eligible.', vn: 'Cô ấy đủ điều kiện.' }, collocations: ['eligible candidate - ứng viên đủ điều kiện'], synonyms: ['qualified'], word_family: 'eligibility (n)'
  } } } };
  const entry = normalizeEntry(raw, 'eligible for payment');
  assert.equal(entry.canonical, 'eligible');
  assert.equal(entry.originalSentence, 'They are eligible for payment.');
  assert.deepEqual(entry.synonyms, ['qualified']);
  assert.equal(entry.workflowRunId, 'run-1');
});

test('dictionary source arrays are serialized as JSON rather than PostgreSQL arrays', () => {
  const source = require('node:fs').readFileSync(require.resolve('../src/modules/dictionary/dictionaryService'), 'utf8');
  assert.match(source, /JSON\.stringify\(payload\.rawExtractionResponse \?\? null\)/);
  assert.match(source, /\$3::jsonb/);
});
