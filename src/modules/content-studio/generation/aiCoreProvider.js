'use strict';

// Content Studio → AI Core. Each content type maps to a published AI Core agent;
// prompts, model, limits and cost ceilings live in AI Core, not here.
// Types without an agent fall back to the mock provider.
const aiCore = require('../../ai-core');
const mockProvider = require('./mockProvider');

const AGENTS = {
  vocab: 'cs.vocab',
  dictionary_extract: 'cs.dict.extract',
  dictionary_entries: 'cs.dict.define',
  passage_translation: 'cs.translate',
  question_pack: 'cs.question_pack',
};
const LETTERS = ['A', 'B', 'C', 'D'];
const SET_CACHE_MS = 30 * 1000; // long enough for the set's artifacts claimed together, short enough for "Tạo lại"
const setCalls = new Map(); // one AI call per question set, shared by the set's question artifacts
const MODES = new Set(['balanced', 'phrase_focused', 'single_word_focused']);

// cs.translate returns Vietnamese only, numbered like the input; join it with the English we already have.
function mergeTranslation(data, sentences) {
  const byIndex = new Map((Array.isArray(data?.t) ? data.t : []).map(row => [Number(row?.i), String(row?.vi || '').trim()]));
  return { sentences: sentences.map((en, index) => ({ en, vi: byIndex.get(index + 1) || '' })) };
}

// cs.question_pack returns Vietnamese stem + options; the "Dịch câu hỏi & đáp án" field is assembled here.
function mapQuestion(row, question) {
  const options = row?.options_vi || {};
  const translation = [String(row?.stem_vi || '').trim(),
    ...LETTERS.filter(letter => question.options?.[letter]).map(letter => `(${letter}) ${String(options[letter] || '').trim()}`)]
    .filter(Boolean).join('\n');
  return {
    translation,
    hint: String(row?.hint || '').trim(),
    explanation: String(row?.explanation || '').trim(),
    note: String(row?.note || '').trim(),
  };
}

function questionSetCall(agentKey, input, ctx) {
  const questions = (input.setQuestions?.length ? input.setQuestions : [input.question]).map(question => ({
    n: question.number, stem: question.stem, options: question.options || {}, answer: question.answerKey || '',
  }));
  const cacheKey = `${input.setId || input.question.id}:${JSON.stringify(questions)}:${input.passage}`;
  const cached = setCalls.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = aiCore.run(agentKey, {
    passage: input.passage,
    passage_vi: input.passageVi || '(chưa có bản dịch)',
    questions: JSON.stringify(questions),
  }, ctx);
  setCalls.set(cacheKey, { promise, expiresAt: Date.now() + SET_CACHE_MS });
  promise.catch(() => setCalls.delete(cacheKey));
  for (const [key, value] of setCalls) if (value.expiresAt <= Date.now()) setCalls.delete(key);
  return promise;
}

// cs.vocab returns { w: [{ o, t, p, i, m }] } (Key Vocab flow) → Content Studio vocab artifact.
function mapVocab(data, settings) {
  const items = (Array.isArray(data?.w) ? data.w : []).map(row => ({
    inText: String(row?.o || '').trim(),
    lemma: String(row?.t || row?.o || '').trim(),
    pos: String(row?.p || '').trim(),
    ipa: String(row?.i || '').trim(),
    meaningVi: String(row?.m || '').trim(),
  })).filter(item => item.inText || item.lemma);
  return { settings, items };
}

async function generate(type, input = {}, options = {}) {
  const agentKey = AGENTS[type];
  if (!agentKey) return mockProvider.generate(type, input, options);
  const ctx = { feature: 'content-studio', refType: 'cs_item', refId: input.itemId || null };

  if (type === 'vocab') {
    const settings = {
      level: Number(input.level) || 650,
      mode: MODES.has(input.mode) ? input.mode : 'balanced',
    };
    const result = await aiCore.run(agentKey, {
      reading_content: input.passage,
      target_score: String(settings.level),
      selection_mode: settings.mode,
    }, ctx);
    return mapVocab(result.data, settings);
  }

  if (type === 'passage_translation') {
    const sentences = input.sentences || [];
    const result = await aiCore.run(agentKey, {
      passage: input.passage,
      sentences: JSON.stringify(sentences.map((en, index) => ({ i: index + 1, en }))),
    }, ctx);
    return mergeTranslation(result.data, sentences);
  }

  if (type === 'question_pack') {
    const result = await questionSetCall(agentKey, input, ctx);
    const row = (result.data?.q || []).find(item => Number(item?.n) === Number(input.question.number));
    if (!row) throw new Error(`AI không trả kết quả cho câu ${input.question.number}.`);
    return mapQuestion(row, input.question);
  }

  if (type === 'dictionary_extract') {
    const result = await aiCore.run(agentKey, { reading_content: input.passage }, ctx);
    return result.data; // { sentences: [{ sentence_text, items: [] }] } — parsed by dictionary/normalize.js
  }

  // dictionary_entries: one batch = all chunks of one sentence, same input contract as the Dify flow.
  const result = await aiCore.run(agentKey, {
    passage: input.passage,
    sentence: input.sentence,
    target_chunk: JSON.stringify(input.targetChunks || []),
  }, ctx);
  return result.data; // { dictionary_entries: [...] } in request order — mapped by dictionary/normalize.js
}

module.exports = { name: 'ai-core', generate, mapVocab, mergeTranslation, mapQuestion, AGENTS };
