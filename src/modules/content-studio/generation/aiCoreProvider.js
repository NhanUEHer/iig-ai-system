'use strict';

// Content Studio → AI Core. Each content type maps to a published AI Core agent;
// prompts, model, limits and cost ceilings live in AI Core, not here.
// Types without an agent yet (translation, question pack) fall back to the mock provider.
const aiCore = require('../../ai-core');
const mockProvider = require('./mockProvider');

const AGENTS = {
  vocab: 'cs.vocab',
  dictionary_extract: 'cs.dict.extract',
  dictionary_entries: 'cs.dict.define',
};
const MODES = new Set(['balanced', 'phrase_focused', 'single_word_focused']);

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

module.exports = { name: 'ai-core', generate, mapVocab, AGENTS };
