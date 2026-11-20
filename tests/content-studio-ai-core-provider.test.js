const test = require('node:test');
const assert = require('node:assert/strict');

const aiCore = require('../src/modules/ai-core');
const provider = require('../src/modules/content-studio/generation/aiCoreProvider');
const { normalizeExtract, mapDictionaryEntries } = require('../src/modules/content-studio/dictionary/normalize');

// Agent variables come from the AI Core registry; by default the published agents use the new prompts.
const registry = require('../src/modules/ai-core/agents/registry');
const declared = { 'cs.translate': ['passage'], 'cs.question_pack': ['image_description', 'passage', 'questions'] };
registry.load = async key => ({ version: { variables: (declared[key] || []).map(name => ({ name })) } });

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

test('translation sends only the passage and keeps the agent\'s own sentence split', async () => {
  const stub = stubRun({ 'cs.translate': { s: [{ en: 'Dear Mr. Lee,', vi: 'Kính gửi ông Lee,' }, { en: ' One. ', vi: 'Một.' }, { en: '', vi: '' }] } });
  try {
    const out = await provider.generate('passage_translation', { itemId: 'i1', passage: 'Dear Mr. Lee,\nOne.', sentences: ['ignored'] });
    assert.deepEqual(stub.calls[0].vars, { passage: 'Dear Mr. Lee,\nOne.' });
    assert.deepEqual(out.sentences, [{ en: 'Dear Mr. Lee,', vi: 'Kính gửi ông Lee,' }, { en: 'One.', vi: 'Một.' }]);
    // Older agent versions ({t:[{i,vi}]}) are still mapped onto our split.
    assert.deepEqual(provider.mapTranslation({ t: [{ i: 1, vi: 'Một.' }] }, ['One.']).sentences, [{ en: 'One.', vi: 'Một.' }]);
  } finally { stub.restore(); }
});

test('single vocabulary fill calls cs.dict.define with the containing sentence and maps compact fields', async () => {
  const passage = 'The first sentence is short. Please bring the revised cost estimates tomorrow.';
  const stub = stubRun({ 'cs.dict.define': { dictionary_entries: [{ canonical: 'cost estimate', pos: 'Noun Phrase', ipa: '/kɒst ˈestɪmət/', meaning_vn: 'bản dự toán chi phí' }] } });
  try {
    const out = await provider.fillVocabItem({ itemId: 'item-9', passage, word: 'cost estimates' });
    assert.deepEqual(stub.calls[0], {
      key: 'cs.dict.define',
      vars: { passage, sentence: 'Please bring the revised cost estimates tomorrow.', target_chunk: JSON.stringify(['cost estimates']) },
      ctx: { feature: 'content-studio', refType: 'cs_item', refId: 'item-9' },
    });
    assert.deepEqual(out, { lemma: 'cost estimate', pos: 'Noun Phrase', ipa: '/kɒst ˈestɪmət/', meaningVi: 'bản dự toán chi phí' });
  } finally { stub.restore(); }
});

test('question pack: one AI call per set, split per question, translation field assembled by the backend', async () => {
  const setQuestions = [1, 2].map(number => ({ id: `q${number}`, number, stem: `Stem ${number}?`, options: { A: 'a', B: 'b', C: 'c', D: 'd' }, answerKey: 'B' }));
  const stub = stubRun({ 'cs.question_pack': { q: [1, 2].map(n => ({
    n, stem_vi: `Câu ${n}?`, options_vi: { A: 'a vi', B: 'b vi', C: 'c vi', D: 'd vi' }, hint: 'h', explanation: 'e', note: 'n',
  })) } });
  try {
    const base = { itemId: 'i1', setId: 'set-1', setQuestions, passage: 'P' };
    const [first, second] = await Promise.all(setQuestions.map(question => provider.generate('question_pack', { ...base, question })));
    assert.equal(stub.calls.length, 1);
    // English only: the passage translation is never sent to the question pack.
    assert.deepEqual(Object.keys(stub.calls[0].vars).sort(), ['image_description', 'passage', 'questions']);
    assert.deepEqual(JSON.parse(stub.calls[0].vars.questions)[1], { n: 2, stem: 'Stem 2?', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, answer: 'B' });
    assert.equal(first.translation, 'Câu 1?\n(A) a vi\n(B) b vi\n(C) c vi\n(D) d vi');
    assert.deepEqual({ hint: second.hint, explanation: second.explanation, note: second.note }, { hint: 'h', explanation: 'e', note: 'n' });
  } finally { stub.restore(); }
});

test('single question regeneration sends only that question and bypasses the set cache', async () => {
  const question = { id: 'q77', number: 77, stem: 'Why?', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, answerKey: 'A' };
  const response = { q: [{ n: 77, stem_vi: 'Tại sao?', options_vi: { A: 'a vi', B: 'b vi', C: 'c vi', D: 'd vi' }, hint: 'h', explanation: 'e', note: 'n' }] };
  const stub = stubRun({ 'cs.question_pack': response });
  try {
    const input = { itemId: 'i-cache', setId: 'set-cache', setQuestions: [question], question, passage: 'Unique cache passage.' };
    await provider.generate('question_pack', input);
    await provider.generate('question_pack', { ...input, bypassSetCache: true });
    assert.equal(stub.calls.length, 2);
    assert.deepEqual(JSON.parse(stub.calls[1].vars.questions), [{ n: 77, stem: 'Why?', options: question.options, answer: 'A' }]);
    assert.deepEqual(stub.calls[1].ctx, { feature: 'content-studio', refType: 'cs_item', refId: 'i-cache' });
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

test('image_description sends the stored image as image data with the question context', async () => {
  const storage = require('../src/services/storageService');
  const original = storage.downloadBuffer;
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2]);
  storage.downloadBuffer = async key => { assert.equal(key, 'r2:content-studio/images/x.png'); return { buffer: bytes }; };
  const calls = [];
  const run = aiCore.run;
  aiCore.run = async (key, vars, ctx, options) => { calls.push({ key, vars, ctx, options }); return { data: { image_type: 'scene_photo', image_description: 'Two men carry a box.' } }; };
  try {
    const out = await provider.generate('image_description', { itemId: 'i1', image: { storedKey: 'r2:content-studio/images/x.png', mime: 'image/png', sha256: 'a' }, contextText: '1. (A) They are carrying a box.' });
    assert.equal(calls[0].key, 'cs.image.describe');
    assert.deepEqual(calls[0].vars, { context: '1. (A) They are carrying a box.' });
    assert.deepEqual(calls[0].options.images, [{ mimeType: 'image/png', data: bytes }]);
    assert.deepEqual(out, { imageType: 'scene_photo', description: 'Two men carry a box.' });
  } finally { aiCore.run = run; storage.downloadBuffer = original; }
});

test('question_pack passes image_description, "(none)" when the set has no image', async () => {
  const stub = stubRun({ 'cs.question_pack': { q: [{ n: 1, stem_vi: '', options_vi: {}, hint: 'h', explanation: 'e', note: 'n' }] } });
  try {
    const question = { id: 'q-img', number: 1, stem: '', options: { A: 'a', B: 'b', C: 'c', D: 'd' }, answerKey: 'A' };
    await provider.generate('question_pack', { itemId: 'i1', setId: 's-img-1', question, setQuestions: [question], passage: '', imageDescription: '[Image for question 1]\nA desk.' });
    await provider.generate('question_pack', { itemId: 'i1', setId: 's-img-2', question, setQuestions: [question], passage: '' });
    assert.equal(stub.calls[0].vars.image_description, '[Image for question 1]\nA desk.');
    assert.equal(stub.calls[1].vars.image_description, '(none)');
    assert.match(stub.calls[1].vars.passage, /^\(none/);
  } finally { stub.restore(); }
});

test('legacy agent versions still get the variables they require during a rollout', async () => {
  const saved = { ...declared };
  declared['cs.translate'] = ['passage', 'sentences'];
  declared['cs.question_pack'] = ['passage', 'passage_vi', 'questions'];
  const stub = stubRun({ 'cs.translate': { t: [{ i: 1, vi: 'Một.' }] }, 'cs.question_pack': { q: [{ n: 9, stem_vi: '', options_vi: {}, hint: 'h', explanation: 'e', note: 'n' }] } });
  try {
    const out = await provider.generate('passage_translation', { itemId: 'i1', passage: 'One.', sentences: ['One.'] });
    assert.equal(stub.calls[0].vars.sentences, JSON.stringify([{ i: 1, en: 'One.' }]));
    assert.deepEqual(out.sentences, [{ en: 'One.', vi: 'Một.' }]);
    const question = { id: 'q-legacy', number: 9, stem: 'Why?', options: { A: 'a', B: 'b' }, answerKey: 'A' };
    await provider.generate('question_pack', { itemId: 'i1', setId: 's-legacy', question, setQuestions: [question], passage: 'P' });
    assert.equal(stub.calls[1].vars.passage_vi, '(chưa có bản dịch)');
  } finally { Object.assign(declared, saved); stub.restore(); }
});
