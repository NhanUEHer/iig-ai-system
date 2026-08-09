function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '') ?? null;
}

function parseEmbeddedResult(result) {
  if (!result) return {};
  try {
    const json = String(result).match(/\{[\s\S]*\}/)?.[0];
    return json ? JSON.parse(json) : {};
  } catch (error) {
    return {};
  }
}

function parseGradingResult(outputs = {}) {
  const parsed = parseEmbeddedResult(outputs.result);
  return {
    transcribe: firstDefined(parsed.transcribe, outputs.transcribe, outputs.text),
    finalScore: firstDefined(parsed.final_score, outputs.final_score),
    pronunciationScore: firstDefined(outputs.pronunciation_score, parsed.pronunciation_score),
    pronunciationRationale: firstDefined(outputs.pronunciation_rationale, parsed.pronunciation_rationale),
    intonationScore: firstDefined(outputs.intonation_score, parsed.intonation_score),
    intonationRationale: firstDefined(outputs.intonation_rationale, parsed.intonation_rationale),
    cohesionScore: firstDefined(outputs.cohesion_score, parsed.cohesion_score, outputs.organization_score, parsed.organization_score),
    cohesionRationale: firstDefined(outputs.cohesion_rationale, parsed.cohesion_rationale, outputs.organization_rationale, parsed.organization_rationale),
    grammarScore: firstDefined(outputs.grammar_score, parsed.grammar_score, outputs.quality_variety_score, parsed.quality_variety_score),
    grammarRationale: firstDefined(outputs.grammar_rationale, parsed.grammar_rationale, outputs.quality_variety_rationale, parsed.quality_variety_rationale),
    vocabularyScore: firstDefined(outputs.vocabulary_score, parsed.vocabulary_score, outputs.keyword_score, parsed.keyword_score),
    vocabularyRationale: firstDefined(outputs.vocabulary_rationale, parsed.vocabulary_rationale, outputs.keyword_rationale, parsed.keyword_rationale),
    completenessScore: firstDefined(outputs.completeness_score, parsed.completeness_score),
    completenessRationale: firstDefined(outputs.completeness_rationale, parsed.completeness_rationale),
    relevanceScore: firstDefined(outputs.relevance_score, parsed.relevance_score, outputs.support_score, parsed.support_score),
    relevanceRationale: firstDefined(outputs.relevance_rationale, parsed.relevance_rationale, outputs.support_rationale, parsed.support_rationale),
    errors: JSON.stringify(parsed.errors || []),
    overall1: firstDefined(parsed.overall_1),
    overall2: firstDefined(parsed.overall_2),
    keyErrors: firstDefined(parsed.key_errors),
    strength: firstDefined(parsed.strength),
    weakness: firstDefined(parsed.weakness),
    improvement: firstDefined(parsed.improvement)
  };
}

module.exports = { firstDefined, parseEmbeddedResult, parseGradingResult };

