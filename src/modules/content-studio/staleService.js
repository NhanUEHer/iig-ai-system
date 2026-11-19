'use strict';

// "Tạo lại phần lỗi thời": regenerate only what the source edit made stale. Never runs automatically.
const contentStudio = require('./contentStudioService');
const generation = require('./generation/generationService');
const dictionary = require('./dictionary/dictionaryService');

async function regenerateStale(itemId) {
  const item = await contentStudio.getItem(itemId);
  const parts = new Set((item.staleParts || []).map(part => part.part));
  const artifacts = item.artifacts.filter(artifact => artifact.stale);
  let queued = 0;
  for (const artifact of artifacts) {
    try { await generation.regenerate(artifact.id); queued += 1; } catch (error) {
      if (error.code !== 'ARTIFACT_BUSY') throw error;
    }
  }
  let dictionaryResult = null;
  if (parts.has('dictionary')) dictionaryResult = await dictionary.resync(itemId);
  return { queued, dictionary: dictionaryResult };
}

module.exports = { regenerateStale };
