const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeExtracted, normalizeEntry, sentenceForCandidate, maxItems } = require('../src/modules/dictionary/dictionaryService');

test('normalizeExtracted accepts Dify structured output and removes duplicates', () => {
  const raw = { data: { outputs: { structured_output: [' Deadline ', 'deadline', 'eligible for payment'] } } };
  assert.deepEqual(normalizeExtracted(raw), [
    { text: 'Deadline', sentenceText: '' },
    { text: 'eligible for payment', sentenceText: '' }
  ]);
});

test('normalizeExtracted preserves sentence ownership and item order', () => {
  const raw = { data: { outputs: { structured_output: { sentences: [
    { sentence_text: 'They will carry out an audit.', items: ['carry out', 'audit'] },
    { sentence_text: 'We value your support.', items: ['support'] }
  ] } } } };
  assert.deepEqual(normalizeExtracted(raw), [
    { text: 'carry out', sentenceText: 'They will carry out an audit.' },
    { text: 'audit', sentenceText: 'They will carry out an audit.' },
    { text: 'support', sentenceText: 'We value your support.' }
  ]);
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

test('normalizeEntry maps usage details from the revised Dify contract', () => {
  const entry = normalizeEntry({ data: { outputs: { structured_output: {
    original_chunk: 'officially', canonical: 'officially', pos: 'Adverb', meaning_vn: 'chính thức', meaning_en: 'in an official manner',
    context_analysis: { original_sentence: 'It was officially announced.', explanation: 'Từ này bổ nghĩa cho hành động công bố.' },
    usage: {
      example: { en: 'It was officially announced.', vn: 'Việc đó đã được thông báo chính thức.' },
      collocations: ['officially announce - chính thức thông báo'], synonyms: ['formally'], word_family: 'official - officially'
    }
  } } } }, 'officially');
  assert.equal(entry.exampleEn, 'It was officially announced.');
  assert.deepEqual(entry.collocations, ['officially announce - chính thức thông báo']);
  assert.deepEqual(entry.synonyms, ['formally']);
  assert.equal(entry.wordFamily, 'official - officially');
});

test('dictionary generation sends the stored source sentence and can infer it for legacy data', () => {
  const passage = 'The board approved the plan. Employees will carry out an audit next week.';
  assert.equal(sentenceForCandidate({ original_chunk: 'carry out', source_sentence: 'Stored source sentence.' }, passage), 'Stored source sentence.');
  assert.equal(sentenceForCandidate({ original_chunk: 'carry out' }, passage), 'Employees will carry out an audit next week.');
  const boundaryPassage = 'The update will significantly reduce delays. If you need help, contact IT.';
  assert.equal(sentenceForCandidate({ original_chunk: 'If' }, boundaryPassage), 'If you need help, contact IT.');
  const clientSource = require('node:fs').readFileSync(require.resolve('../src/clients/dictionaryDifyClient'), 'utf8');
  assert.match(clientSource, /\{\s*passage,\s*sentence,\s*target_chunk: targetChunk\s*\}/);
  const serviceSource = require('node:fs').readFileSync(require.resolve('../src/modules/dictionary/dictionaryService'), 'utf8');
  assert.match(serviceSource, /RETURNING id,generation_id,original_chunk,source_sentence,display_order/);
});

test('dictionary source arrays are serialized as JSON rather than PostgreSQL arrays', () => {
  const source = require('node:fs').readFileSync(require.resolve('../src/modules/dictionary/dictionaryService'), 'utf8');
  assert.match(source, /JSON\.stringify\(payload\.rawExtractionResponse \?\? null\)/);
  assert.match(source, /\$3::jsonb/);
});
