const VALID_SKILLS = new Set(['LISTENING', 'READING', 'SPEAKING', 'WRITING']);
const VALID_SCOPES = new Set(['SINGLE_ITEM', 'QUESTION_GROUP', 'FULL_SKILL_TEST', 'FULL_SW_TEST', 'FULL_TOEIC_TEST']);
const normalizeText = value => String(value || '').normalize('NFC').replace(/\s+/g, ' ').trim();
const keyText = value => normalizeText(value).toLowerCase();
const array = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.filter(Boolean))];
const pick = (value, ...keys) => keys.reduce((found, key) => found ?? value?.[key], undefined);

function quoteOf(value) { return typeof value === 'string' ? value : String(value?.quote || ''); }
function evidenceExists(sourceText, evidence) {
  const quote = keyText(quoteOf(evidence));
  return quote.length >= 4 && keyText(sourceText).includes(quote);
}

function confidenceFor(item) {
  let score = 0; const reasons = [];
  if (item.evidence.length) { score += 35; reasons.push('Có bằng chứng nguyên văn hợp lệ'); }
  if (item.questionNumbers.length) { score += 20; reasons.push('Có câu hoặc nhóm câu được xác định'); }
  if (item.taskType) { score += 15; reasons.push('Có dạng nhiệm vụ'); }
  if (item.topic || item.recalledContent) { score += 20; reasons.push('Có chủ đề hoặc nội dung nhớ lại'); }
  if (item.candidateResponse) { score += 10; reasons.push('Có thông tin phản hồi của thí sinh'); }
  return { score, level: score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW', reasons };
}

function normalizeRecall(item, index, sourceText, counters) {
  const rawEvidence = array(item?.evidence).length ? array(item.evidence) : item?.evidence ? [item.evidence] : [];
  const evidence = rawEvidence.filter(entry => {
    const valid = evidenceExists(sourceText, entry); counters[valid ? 'acceptedEvidence' : 'rejectedEvidence']++; return valid;
  }).map(entry => ({ segmentId: pick(entry, 'segmentId', 'segment_id') || null, quote: quoteOf(entry) }));
  const skill = String(item?.skill || '').toUpperCase();
  const questionNumbers = array(pick(item, 'questionNumbers', 'question_numbers')).length
    ? array(pick(item, 'questionNumbers', 'question_numbers')).map(String)
    : normalizeText(pick(item, 'questionNumbers', 'question_numbers')).split(/\s*[,–-]\s*/).filter(Boolean);
  const result = {
    id: String(pick(item, 'id', 'recallId', 'recall_id') || `RC-${String(index + 1).padStart(3, '0')}`),
    skill: VALID_SKILLS.has(skill) ? skill : 'UNKNOWN',
    questionNumbers,
    taskType: normalizeText(pick(item, 'taskType', 'task_type')),
    topic: normalizeText(item?.topic),
    recalledContent: normalizeText(pick(item, 'recalledContent', 'recalled_content', 'promptRecall')),
    candidateResponse: normalizeText(pick(item, 'candidateResponse', 'candidate_response')),
    testedAbilities: array(pick(item, 'testedAbilities', 'tested_abilities')).map(normalizeText),
    difficultySignals: array(pick(item, 'difficultySignals', 'difficulty_signals')).map(normalizeText),
    candidateErrors: array(pick(item, 'candidateErrors', 'candidate_errors')).map(normalizeText),
    evidence,
    limitations: array(item?.limitations).map(normalizeText)
  };
  result.confidence = confidenceFor(result);
  return result;
}

function inferCoverage(recalledItems, supplied = {}) {
  const coveredGroups = unique(recalledItems.map(item => `${item.skill}_${item.questionNumbers.join('_') || item.taskType}`).filter(value => !value.startsWith('UNKNOWN_')));
  const skills = unique(recalledItems.map(item => item.skill).filter(VALID_SKILLS.has.bind(VALID_SKILLS)));
  const suppliedLevel = String(pick(supplied, 'level', 'coverageLevel', 'coverage_level') || '').toUpperCase();
  const level = suppliedLevel || (recalledItems.length <= 1 ? 'SINGLE_ITEM' : skills.length > 1 ? 'MULTI_SKILL' : 'PARTIAL_SECTION');
  const allowedScopes = recalledItems.length ? ['SINGLE_ITEM', ...(recalledItems.length > 1 ? ['QUESTION_GROUP'] : [])] : [];
  if (level === 'FULL_SECTION' || level === 'FULL_SW_TEST' || level === 'FULL_EXAM') allowedScopes.push('FULL_SKILL_TEST');
  if (level === 'FULL_SW_TEST') allowedScopes.push('FULL_SW_TEST');
  if (level === 'FULL_EXAM') allowedScopes.push('FULL_TOEIC_TEST');
  const blockedScopes = ['FULL_SKILL_TEST', 'FULL_SW_TEST', 'FULL_TOEIC_TEST'].filter(scope => !allowedScopes.includes(scope));
  return {
    level,
    coveredGroups,
    missingGroups: array(pick(supplied, 'missingGroups', 'missing_groups')).map(String),
    allowedScopes: unique(allowedScopes),
    blockedScopes: unique([...blockedScopes, ...array(pick(supplied, 'blockedScopes', 'blocked_scopes')).map(String).filter(scope => !allowedScopes.includes(scope))])
  };
}

function normalizeAnalysisV2(raw, { sourceId, sourceText }) {
  const counters = { acceptedEvidence: 0, rejectedEvidence: 0, removedRecalledItems: 0, removedInsights: 0, removedLearningNeeds: 0 };
  const rawRecalls = array(pick(raw, 'recalledItems', 'recalled_items'));
  const recalledItems = rawRecalls.map((item, index) => normalizeRecall(item, index, sourceText, counters)).filter(item => {
    const keep = item.evidence.length > 0; if (!keep) counters.removedRecalledItems++; return keep;
  });
  const recallIds = new Set(recalledItems.map(item => item.id));
  const rawInsights = array(pick(raw, 'sourceInsights', 'source_insights', 'insights'));
  const sourceInsights = rawInsights.map((item, index) => ({
    id: String(pick(item, 'id', 'insightId', 'insight_id') || `IS-${String(index + 1).padStart(3, '0')}`),
    basedOnRecallIds: array(pick(item, 'basedOnRecallIds', 'based_on_recall_ids')).map(String).filter(recallIds.has.bind(recallIds)),
    type: normalizeText(item?.type || 'LEARNING_IMPLICATION'),
    finding: normalizeText(item?.finding),
    observation: normalizeText(pick(item, 'observation', 'sourceObservation', 'source_observation')),
    testedAbilities: array(pick(item, 'testedAbilities', 'tested_abilities')).map(normalizeText),
    notableFeatures: array(pick(item, 'notableFeatures', 'notable_features')).map(normalizeText),
    difficulty: {
      level: String(pick(item?.difficulty || {}, 'level') || pick(item, 'difficultyLevel', 'difficulty_level') || 'MEDIUM').toUpperCase(),
      reasons: array(pick(item?.difficulty || {}, 'reasons') || pick(item, 'difficultyReasons', 'difficulty_reasons')).map(normalizeText)
    },
    likelyErrors: array(pick(item, 'likelyErrors', 'likely_errors', 'candidateErrors', 'candidate_errors')).map(normalizeText),
    learnerImplication: normalizeText(pick(item, 'learnerImplication', 'learner_implication', 'implication')),
    recommendedPractice: array(pick(item, 'recommendedPractice', 'recommended_practice')).map(normalizeText),
    confidenceLevel: String(pick(item, 'confidenceLevel', 'confidence_level') || 'MEDIUM').toUpperCase(),
    confidenceReasons: array(pick(item, 'confidenceReasons', 'confidence_reasons')).map(normalizeText),
    limitations: array(item?.limitations).map(normalizeText)
  })).filter(item => {
    const keep = item.basedOnRecallIds.length > 0 && item.finding; if (!keep) counters.removedInsights++; return keep;
  });
  const insightIds = new Set(sourceInsights.map(item => item.id));
  const rawNeeds = array(pick(raw, 'learningNeeds', 'learning_needs', 'materialRecommendations'));
  const learningNeeds = rawNeeds.map((item, index) => ({
    id: String(pick(item, 'id', 'needId', 'need_id') || `LN-${String(index + 1).padStart(3, '0')}`),
    basedOnRecallIds: array(pick(item, 'basedOnRecallIds', 'based_on_recall_ids')).map(String).filter(recallIds.has.bind(recallIds)),
    basedOnInsightIds: array(pick(item, 'basedOnInsightIds', 'based_on_insight_ids')).map(String).filter(insightIds.has.bind(insightIds)),
    scope: String(item?.scope || (recalledItems.length === 1 ? 'SINGLE_ITEM' : 'QUESTION_GROUP')).toUpperCase(),
    skill: String(item?.skill || '').toUpperCase(),
    questionGroup: normalizeText(pick(item, 'questionGroup', 'question_group')),
    title: normalizeText(item?.title),
    objective: normalizeText(item?.objective || item?.reason),
    rationale: normalizeText(pick(item, 'rationale', 'learningGap', 'learning_gap')),
    priority: {
      level: String(pick(item?.priority || {}, 'level') || pick(item, 'priorityLevel', 'priority_level') || 'MEDIUM').toUpperCase(),
      reason: normalizeText(pick(item?.priority || {}, 'reason') || pick(item, 'priorityReason', 'priority_reason'))
    },
    learningFocus: array(pick(item, 'learningFocus', 'learning_focus')).map(normalizeText),
    contentBrief: (() => {
      const brief = pick(item, 'contentBrief', 'content_brief') || {};
      return {
        context: normalizeText(brief.context),
        task: normalizeText(brief.task),
        languageFocus: array(pick(brief, 'languageFocus', 'language_focus')).map(normalizeText),
        difficulty: String(brief.difficulty || 'MEDIUM').toUpperCase()
      };
    })(),
    materialTypes: array(pick(item, 'materialTypes', 'material_types', 'suggestedAssets')).map(String),
    deliverables: array(item?.deliverables).map(deliverable => ({
      type: String(deliverable?.type || ''),
      quantity: Math.max(1, Number(deliverable?.quantity) || 1),
      description: normalizeText(deliverable?.description)
    })).filter(deliverable => deliverable.type),
    suggestedCoverage: pick(item, 'suggestedCoverage', 'suggested_coverage') || {},
    successCriteria: array(pick(item, 'successCriteria', 'success_criteria')).map(normalizeText),
    generationConstraints: array(pick(item, 'generationConstraints', 'generation_constraints')).map(normalizeText),
    limitations: array(item?.limitations).map(normalizeText)
  })).filter(item => {
    const keep = item.basedOnRecallIds.length > 0 && VALID_SCOPES.has(item.scope); if (!keep) counters.removedLearningNeeds++; return keep;
  });
  const classification = raw.classification || {};
  const summary = pick(raw, 'sourceSummary', 'source_summary') || {};
  const skills = unique(array(summary.skills || classification.skills).map(value => String(value).toUpperCase()).filter(VALID_SKILLS.has.bind(VALID_SKILLS)));
  const coverage = inferCoverage(recalledItems, raw.coverage || {});
  const blocked = new Set(coverage.blockedScopes);
  const filteredNeeds = learningNeeds.filter(item => { const keep = !blocked.has(item.scope); if (!keep) counters.removedLearningNeeds++; return keep; });
  const returnedSourceId = String(pick(raw, 'sourceId', 'source_id') || '');
  const warnings = [];
  if (returnedSourceId && returnedSourceId !== String(sourceId)) warnings.push('Dify trả source_id không khớp; backend đã sử dụng ID nguồn gốc.');
  return {
    analysis: {
      schemaVersion: 'source-analysis-v2',
      sourceId,
      sourceSummary: {
        contentType: String(pick(summary, 'contentType', 'content_type') || pick(classification, 'contentType', 'content_type') || 'OTHER'),
        exam: String(summary.exam || classification.exam || 'TOEIC'),
        skills,
        coverageLevel: coverage.level,
        detailLevel: String(pick(summary, 'detailLevel', 'detail_level') || 'PARTIAL')
      },
      examContext: pick(raw, 'examContext', 'exam_context') || {},
      coverage,
      recalledItems,
      sourceInsights,
      learningNeeds: filteredNeeds,
      notRecommended: array(pick(raw, 'notRecommended', 'not_recommended')).map(item => ({ scope: String(item?.scope || ''), reason: normalizeText(item?.reason) })),
      uncertainties: array(raw.uncertainties).map(value => typeof value === 'string' ? value : normalizeText(value?.message || value?.detail))
    },
    metadata: { ...counters, warnings, evidenceValidation: 'exact_normalized_substring', validatedAt: new Date().toISOString() }
  };
}

module.exports = { normalizeAnalysisV2, evidenceExists };
