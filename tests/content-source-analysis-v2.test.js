const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAnalysisV2, evidenceExists } = require('../src/modules/content-sources/sourceAnalysisV2');
const { parseAnalysis } = require('../src/clients/contentAnalysisDifyClient');

const sourceText = 'Review TOEIC Speaking. Q8 đến Q10 hỏi về lịch làm việc, đổi giờ hẹn và lý do lựa chọn.';

test('Dify adapter accepts object and fenced JSON string outputs', () => {
  assert.deepEqual(parseAnalysis({ ok: true }), { ok: true });
  assert.deepEqual(parseAnalysis('```json\n{"ok":true}\n```'), { ok: true });
  assert.equal(parseAnalysis('not-json'), null);
});

test('v2 validator keeps exact evidence and links insight and learning need', () => {
  const raw = {
    schema_version: 'source-analysis-v2',
    source_summary: { content_type: 'POST_EXAM_RECALL', exam: 'TOEIC', skills: ['SPEAKING'] },
    recalled_items: [{
      recall_id: 'RC-001', skill: 'SPEAKING', question_numbers: ['Q8', 'Q9', 'Q10'],
      task_type: 'RESPOND_TO_QUESTIONS', topic: 'Lịch làm việc', recalled_content: 'Hỏi về lịch và đổi giờ.',
      evidence: [{ segment_id: 'P1', quote: 'Q8 đến Q10 hỏi về lịch làm việc, đổi giờ hẹn và lý do lựa chọn.' }]
    }],
    source_insights: [{ insight_id: 'IS-001', based_on_recall_ids: ['RC-001'], type: 'TESTED_ABILITY', finding: 'Xử lý thông tin lịch.', source_observation: 'Nguồn nhắc Q8-Q10 cùng dùng một lịch.', tested_abilities: ['Quét bảng'], notable_features: ['Có điều kiện đổi giờ'], difficulty: { level: 'HIGH', reasons: ['Có dữ kiện gây nhiễu'] }, likely_errors: ['Đọc nhầm giờ'], learner_implication: 'Cần luyện phản xạ.', recommended_practice: ['Drill lịch biểu'] }],
    learning_needs: [{ need_id: 'LN-001', based_on_recall_ids: ['RC-001'], based_on_insight_ids: ['IS-001'], scope: 'QUESTION_GROUP', skill: 'SPEAKING', question_group: 'Q8-Q10', objective: 'Luyện xử lý lịch.', learning_gap: 'Dễ đọc nhầm giờ.', priority: { level: 'HIGH', reason: 'Cần nhiều bước đối chiếu.' }, learning_focus: ['Scanning lịch'], content_brief: { context: 'Lịch hội nghị mới', task: 'Trả lời ba câu', language_focus: ['Giờ và địa điểm'], difficulty: 'HIGH' }, material_types: ['SKILL_DRILL'], deliverables: [{ type: 'SKILL_DRILL', quantity: 3, description: 'Ba bảng lịch mới' }], success_criteria: ['Đúng dữ kiện'], generation_constraints: ['Không sao chép nguồn'] }]
  };
  const result = normalizeAnalysisV2(raw, { sourceId: 'source-1', sourceText });
  assert.equal(result.analysis.recalledItems.length, 1);
  assert.deepEqual(result.analysis.sourceInsights[0].basedOnRecallIds, ['RC-001']);
  assert.equal(result.analysis.sourceInsights[0].observation, 'Nguồn nhắc Q8-Q10 cùng dùng một lịch.');
  assert.deepEqual(result.analysis.sourceInsights[0].testedAbilities, ['Quét bảng']);
  assert.deepEqual(result.analysis.sourceInsights[0].difficulty, { level: 'HIGH', reasons: ['Có dữ kiện gây nhiễu'] });
  assert.deepEqual(result.analysis.sourceInsights[0].recommendedPractice, ['Drill lịch biểu']);
  assert.deepEqual(result.analysis.learningNeeds[0].basedOnInsightIds, ['IS-001']);
  assert.equal(result.analysis.learningNeeds[0].rationale, 'Dễ đọc nhầm giờ.');
  assert.deepEqual(result.analysis.learningNeeds[0].priority, { level: 'HIGH', reason: 'Cần nhiều bước đối chiếu.' });
  assert.equal(result.analysis.learningNeeds[0].deliverables[0].quantity, 3);
  assert.deepEqual(result.analysis.learningNeeds[0].contentBrief.languageFocus, ['Giờ và địa điểm']);
  assert.equal(result.metadata.acceptedEvidence, 1);
  assert.equal(result.analysis.recalledItems[0].confidence.level, 'HIGH');
});

test('v2 validator removes fabricated evidence and dangling recommendations', () => {
  const raw = {
    recalled_items: [{ recall_id: 'RC-X', skill: 'SPEAKING', evidence: [{ quote: 'Câu không hề có trong nguồn' }] }],
    source_insights: [{ insight_id: 'IS-X', based_on_recall_ids: ['RC-X'], finding: 'Không hợp lệ' }],
    learning_needs: [{ need_id: 'LN-X', based_on_recall_ids: ['RC-X'], scope: 'FULL_TOEIC_TEST' }]
  };
  const result = normalizeAnalysisV2(raw, { sourceId: 'source-1', sourceText });
  assert.equal(result.analysis.recalledItems.length, 0);
  assert.equal(result.analysis.sourceInsights.length, 0);
  assert.equal(result.analysis.learningNeeds.length, 0);
  assert.equal(result.metadata.rejectedEvidence, 1);
});

test('evidence comparison tolerates whitespace and unicode normalization', () => {
  assert.equal(evidenceExists('Q8   hỏi về lịch làm việc', { quote: 'Q8 hỏi về lịch làm việc' }), true);
});
