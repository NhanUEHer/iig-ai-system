const crypto = require('node:crypto');

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
}

function fingerprint(value) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

function normalizeGroupIds(value) {
  const groups = Array.isArray(value) ? value : [];
  return [...new Set(groups.filter(Boolean).map(String))].sort();
}

function buildScoringPlan(rows, { policyVersion, inputSchemaVersion = 1 } = {}) {
  if (!policyVersion || !String(policyVersion).trim()) {
    throw Object.assign(new Error('A scoring policy version is required.'), {
      code: 'IIG_AI_SCORING_POLICY_REQUIRED',
    });
  }
  if (!Array.isArray(rows) || !rows.length) {
    throw Object.assign(new Error('The submission has no AI-ready question attempts.'), {
      code: 'IIG_AI_NO_READY_QUESTIONS',
    });
  }

  const sortedRows = [...rows].sort((left, right) => {
    const order = Number(left.sort_order || 0) - Number(right.sort_order || 0);
    return order || String(left.question_attempt_id).localeCompare(String(right.question_attempt_id));
  });
  const submissionId = String(sortedRows[0].submission_id);
  if (sortedRows.some(row => String(row.submission_id) !== submissionId)) {
    throw Object.assign(new Error('Question attempts belong to different submissions.'), {
      code: 'IIG_AI_MIXED_SUBMISSIONS',
    });
  }

  const questions = sortedRows.map(row => {
    const input = row.ai_input;
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw Object.assign(new Error(`Question attempt ${row.question_attempt_id} has no AI input.`), {
        code: 'IIG_AI_INPUT_MISSING',
      });
    }
    const inputMaterial = {
      schemaVersion: inputSchemaVersion,
      processingVersion: row.processing_version || null,
      questionContentHash: row.question_content_hash || null,
      aiInput: input,
    };
    return {
      questionAttemptId: String(row.question_attempt_id),
      inputFingerprint: fingerprint(inputMaterial),
      scoreGroupIds: normalizeGroupIds(row.score_group_ids),
      sortOrder: Number(row.sort_order || 0),
    };
  });
  const scoreGroupIds = [...new Set(questions.flatMap(question => question.scoreGroupIds))].sort();
  if (!scoreGroupIds.length) {
    throw Object.assign(new Error('AI-ready questions are not assigned to any score group.'), {
      code: 'IIG_AI_SCORE_GROUP_MISSING',
    });
  }

  const normalizedPolicyVersion = String(policyVersion).trim();
  const inputFingerprint = fingerprint({
    inputSchemaVersion,
    policyVersion: normalizedPolicyVersion,
    questions: questions.map(question => ({
      questionAttemptId: question.questionAttemptId,
      inputFingerprint: question.inputFingerprint,
      scoreGroupIds: question.scoreGroupIds,
    })),
  });
  return {
    submissionId,
    policyVersion: normalizedPolicyVersion,
    inputSchemaVersion,
    inputFingerprint,
    requestKey: `iig-ai-scoring:${submissionId}:${normalizedPolicyVersion}:${inputFingerprint}:v1`,
    questions,
    scoreGroupIds,
  };
}

module.exports = { stableValue, fingerprint, buildScoringPlan };
