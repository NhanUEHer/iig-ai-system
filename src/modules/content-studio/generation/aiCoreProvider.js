'use strict';

// Content Studio → AI Core. Each content type maps to a published AI Core agent;
// prompts, model, limits and cost ceilings live in AI Core, not here.
// Types without an agent fall back to the mock provider.
const aiCore = require('../../ai-core');
const registry = require('../../ai-core/agents/registry');
const mockProvider = require('./mockProvider');
const storage = require('../../../services/storageService');
const { splitSentences } = require('../detect/detectContent');

const AGENTS = {
  vocab: 'cs.vocab',
  dictionary_extract: 'cs.dict.extract',
  dictionary_entries: 'cs.dict.define',
  passage_translation: 'cs.translate',
  question_pack: 'cs.question_pack',
  image_description: 'cs.image.describe',
};
// Sent when the question set has no image; the question_pack prompt must not invent one.
const NO_IMAGE = '(none)';
const LETTERS = ['A', 'B', 'C', 'D'];
// Question-only sets (Part 1/2/5) have no passage; say so explicitly instead of sending an empty tag.
const NO_PASSAGE = '(none — this set has questions only, no passage or transcript)';
const SET_CACHE_MS = 30 * 1000; // long enough for the set's artifacts claimed together, short enough for "Tạo lại"
const setCalls = new Map(); // one AI call per question set, shared by the set's question artifacts
const MODES = new Set(['balanced', 'phrase_focused', 'single_word_focused']);

// cs.translate receives only the passage, splits it itself and returns {s: [{en, vi}]} in reading order.
// Older agent versions answered {t: [{i, vi}]} against our own split; that shape is still understood.
function mapTranslation(data, sentences = []) {
  if (Array.isArray(data?.s)) {
    return { sentences: data.s
      .map(row => ({ en: String(row?.en || '').trim(), vi: String(row?.vi || '').trim() }))
      .filter(row => row.en || row.vi) };
  }
  return mergeTranslation(data, sentences);
}

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

// Variables the published version of an agent declares (registry is cached for a minute).
// Lets one release work with old and new agent prompts during a rollout: legacy variables
// (passage_vi, sentences) are sent only to an agent version that still requires them.
async function declaredVariables(agentKey) {
  try {
    const { version } = await registry.load(agentKey, { mode: 'run' });
    return new Set((version?.variables || []).map(variable => variable?.name).filter(Boolean));
  } catch {
    return new Set(); // missing/paused agent: aiCore.run reports the real error
  }
}

async function questionSetVariables(agentKey, input, questions) {
  const variables = { passage: input.passage || NO_PASSAGE, image_description: input.imageDescription || NO_IMAGE, questions: JSON.stringify(questions) };
  // Old prompts required passage_vi; the question pack is English-only now, so it never carries a translation.
  if ((await declaredVariables(agentKey)).has('passage_vi')) variables.passage_vi = '(chưa có bản dịch)';
  return variables;
}

function questionSetCall(agentKey, input, ctx) {
  const questions = (input.setQuestions?.length ? input.setQuestions : [input.question]).map(question => ({
    n: question.number, stem: question.stem, options: question.options || {}, answer: question.answerKey || '',
  }));
  if (input.bypassSetCache) {
    return questionSetVariables(agentKey, input, questions).then(variables => aiCore.run(agentKey, variables, ctx));
  }
  const cacheKey = `${input.setId || input.question.id}:${JSON.stringify(questions)}:${input.passage}:${input.imageDescription || ''}`;
  const cached = setCalls.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = questionSetVariables(agentKey, input, questions).then(variables => aiCore.run(agentKey, variables, ctx));
  setCalls.set(cacheKey, { promise, expiresAt: Date.now() + SET_CACHE_MS });
  promise.catch(() => setCalls.delete(cacheKey));
  for (const [key, value] of setCalls) if (value.expiresAt <= Date.now()) setCalls.delete(key);
  return promise;
}

function sentenceForWord(passage, word) {
  const needle = String(word || '').trim().toLocaleLowerCase();
  if (!needle) return '';
  const text = String(passage || '');
  return splitSentences(text).find(value => value.toLocaleLowerCase().includes(needle))
    || text.split(/\n+/).map(value => value.trim()).find(value => value.toLocaleLowerCase().includes(needle))
    || '';
}

// A vocabulary row uses the compact dictionary agent so one manual word can be
// completed without paying for (or replacing) the full cs.vocab list.
async function fillVocabItem({ passage, word, itemId }) {
  const sentence = sentenceForWord(passage, word);
  if (!sentence) throw new Error(`Không tìm thấy “${word}” trong đoạn văn.`);
  const result = await aiCore.run(AGENTS.dictionary_entries, {
    passage,
    sentence,
    target_chunk: JSON.stringify([word]),
  }, { feature: 'content-studio', refType: 'cs_item', refId: itemId || null });
  const row = Array.isArray(result.data?.dictionary_entries) ? result.data.dictionary_entries[0] : null;
  if (!row) throw new Error('AI không trả kết quả cho từ vựng này.');
  return {
    lemma: String(row.canonical || word).trim(),
    pos: String(row.pos || '').trim(),
    ipa: String(row.ipa || '').trim(),
    meaningVi: String(row.meaning_vn || '').trim(),
  };
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

// cs.image.describe returns { image_type, image_description }; keep a stable camelCase shape.
function mapImageDescription(data) {
  return {
    imageType: String(data?.image_type || data?.type || 'other').trim(),
    description: String(data?.image_description || data?.description || '').trim(),
  };
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
    const variables = { passage: input.passage };
    // Old cs.translate versions translated our own numbered split; new ones split the passage themselves.
    if ((await declaredVariables(agentKey)).has('sentences')) {
      variables.sentences = JSON.stringify((input.sentences || []).map((en, index) => ({ i: index + 1, en })));
    }
    const result = await aiCore.run(agentKey, variables, ctx);
    return mapTranslation(result.data, input.sentences || []);
  }

  if (type === 'image_description') {
    // The image itself goes to AI Core as image data; `context` (the question text) is optional in the agent.
    const { buffer } = await storage.downloadBuffer(input.image.storedKey);
    const result = await aiCore.run(agentKey, { context: input.contextText || '' }, ctx, {
      images: [{ mimeType: input.image.mime, data: buffer }],
    });
    return mapImageDescription(result.data);
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

module.exports = { name: 'ai-core', generate, fillVocabItem, mapVocab, mergeTranslation, mapTranslation, mapQuestion, mapImageDescription, AGENTS, NO_IMAGE };
