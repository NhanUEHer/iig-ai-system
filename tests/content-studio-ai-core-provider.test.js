const test = require('node:test');
const assert = require('node:assert/strict');

const aiCore = require('../src/modules/ai-core');
const provider = require('../src/modules/content-studio/generation/aiCoreProvider');
const { normalizeExtract, mapDictionaryEntries } = require('../src/modules/content-studio/dictionary/normalize');

function stubRun(responses) {
  const calls = [];
  const original = aiCore.run;
  aiCore.run = async (key, vars, ctx) => { calls.push({ key, vars, ctx }); return { data: responses[key] }; };
  return { calls, restore: () => { aiCore.run = original; } };
}

test('vocab maps Key Vocab output (o,t,p,i,m) to Content Studio items with level and mode', async () => {
  const stub = stubRun({ 'cs.vocab': { w: [{ o: 'cost estimates', t: 'cost estimate', p: 'Noun Phrase', i: '/kɒst ˈestɪmət/', m: 'bản dự toán chi phí' }] } });
  try {
    const out = await provider.generate('vocab', { itemId: 'i1', passage: 'bring the cost estimates', level: 700, mode: 'phrase_focused' });
    assert.deepEqual(stub.calls[0].vars, { reading_content: 'bring the cost estimates', target_score: '700', selection_mode: 'phrase_focused' });
    assert.deepEqual(stub.calls[0].ctx, { feature: 'content-studio', refType: 'cs_item', refId: 'i1' });
    assert.deepEqual(out, { settings: { level: 700, mode: 'phrase_focused' }, items: [{ inText: 'cost estimates', lemma: 'cost estimate', pos: 'Noun Phrase', ipa: '/kɒst ˈestɪmət/', meaningVi: 'bản dự toán chi phí' }] });
  } finally { stub.restore(); }
});

test('dictionary extract and define keep the Dify flow contract understood by normalize.js', async () => {
  const sentence = 'I am writing in reference to the partnership proposal.';
  const stub = stubRun({
    'cs.dict.extract': { sentences: [{ sentence_text: sentence, items: ['in reference to', 'partnership proposal'] }] },
    'cs.dict.define': { dictionary_entries: ['in reference to', 'partnership proposal'].map(canonical => ({
      canonical, pos: 'Phrase', ipa: '/x/', meaning_vn: 'nghĩa', meaning_en: 'meaning',
      context_analysis: { original_sentence: sentence, explanation: 'giải thích' },
      usage: { example: { en: 'e', vn: 'v' }, collocations: [], synonyms: [], word_family: 'a - b' },
    })) },
  });
  try {
    const extracted = normalizeExtract(await provider.generate('dictionary_extract', { itemId: 'i1', passage: sentence }), sentence);
    assert.deepEqual(extracted, [{ sentenceText: sentence, items: ['in reference to', 'partnership proposal'] }]);
    const raw = await provider.generate('dictionary_entries', { itemId: 'i1', passage: sentence, sentence, targetChunks: extracted[0].items });
    assert.equal(stub.calls[1].vars.target_chunk, JSON.stringify(['in reference to', 'partnership proposal']));
    const entries = mapDictionaryEntries(raw, extracted[0].items, sentence);
    assert.equal(entries.length, 2);
    assert.equal(entries[1].inText, 'partnership proposal');
    assert.deepEqual(entries[0].wordFamily, ['a', 'b']);
  } finally { stub.restore(); }
});

test('translation sends numbered English and joins the Vietnamese-only answer by index', async () => {
  const stub = stubRun({ 'cs.translate': { t: [{ i: 2, vi: 'Câu hai.' }, { i: 1, vi: 'Câu một.' }] } });
  try {
    const out = await provider.generate('passage_translation', { itemId: 'i1', passage: 'One. Two. Three.', sentences: ['One.', 'Two.', 'Three.'] });
    assert.equal(stub.calls[0].vars.sentences, JSON.stringify([{ i: 1, en: 'One.' }, { i: 2, en: 'Two.' }, { i: 3, en: 'Three.' }]));
    assert.deepEqual(out.sentences, [{ en: 'One.', vi: 'Câu một.' }, { en: 'Two.', vi: 'Câu hai.' }, { en: 'Three.', vi: '' }]);
  } finally { stub.restore(); }
});

test('question pack: one AI call per set, split per question, translation field assembled by the backend', async () => {
  const setQuestions = [1, 2].map(number => ({ id: `q${number}`, number, stem: `Stem ${number}?`, options: { A: 'a', B: 'b', C: 'c', D: 'd' }, answerKey: 'B' }));
  const stub = stubRun({ 'cs.question_pack': { q: [1, 2].map(n => ({
    n, stem_vi: `Câu ${n}?`, options_vi: { A: 'a vi', B: 'b vi', C: 'c vi', D: 'd vi' }, hint: 'h', explanation: 'e', note: 'n',
  })) } });
  try {
    const base = { itemId: 'i1', setId: 'set-1', setQuestions, passage: 'P', passageVi: '' };
    const [first, second] = await Promise.all(setQuestions.map(question => provider.generate('question_pack', { ...base, question })));
    assert.equal(stub.calls.length, 1);
    assert.equal(stub.calls[0].vars.passage_vi, '(chưa có bản dịch)');
    assert.deepEqual(JSON.parse(stub.calls[0].vars.questions)[1], { n: 2, stem: 'Stem 2?', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, answer: 'B' });
    assert.equal(first.translation, 'Câu 1?\n(A) a vi\n(B) b vi\n(C) c vi\n(D) d vi');
    assert.deepEqual({ hint: second.hint, explanation: second.explanation, note: second.note }, { hint: 'h', explanation: 'e', note: 'n' });
  } finally { stub.restore(); }
});

test('types without an AI Core agent fall back to the mock provider', async () => {
  const stub = stubRun({});
  try {
    const out = await provider.generate('dictionary', { sentences: ['Hello there.'] });
    assert.equal(stub.calls.length, 0);
    assert.ok(out);
  } finally { stub.restore(); }
});
