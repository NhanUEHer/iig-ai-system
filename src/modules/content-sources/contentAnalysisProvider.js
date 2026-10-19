const gemini = require('../../clients/geminiContentClient');
const dify = require('../../clients/contentAnalysisDifyClient');
const { normalizeAnalysisV2 } = require('./sourceAnalysisV2');

async function analyze({ sourceId, sourceText, sourceType, userId, legacyValidator }) {
  const provider = String(process.env.CONTENT_ANALYSIS_PROVIDER || 'gemini').trim().toLowerCase();
  if (provider === 'dify') {
    const result = await dify.analyzeText({ sourceId, sourceText, sourceType, userId });
    const normalized = normalizeAnalysisV2(result.analysis, { sourceId, sourceText });
    return { ...result, analysis: normalized.analysis, validationMetadata: normalized.metadata };
  }
  const result = await gemini.analyzeText(sourceText);
  const checked = legacyValidator(sourceText, result.analysis);
  return { ...result, provider: 'gemini', schemaVersion: 'source-analysis-v1', providerRunId: null, analysis: checked.analysis, validationMetadata: checked.metadata };
}

module.exports = { analyze };
