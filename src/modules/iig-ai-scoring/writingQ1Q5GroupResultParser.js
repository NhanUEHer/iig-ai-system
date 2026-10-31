const RESULT_SCHEMA_VERSION = 'write-sentence-group-result-v1';
const ALLOWED_RESULT_FIELDS = new Set([
  'schema_version', 'job_id', 'keycode', 'group_code', 'status',
  'group_final_score', 'group_raw_total', 'group_score_max', 'group_average',
  'question_scores', 'applied_rules', 'versions',
]);

class WritingQ1Q5GroupOutputError extends Error {
  constructor(message, code = 'IIG_AI_WRITE_SENTENCE_PICTURE_GROUP_DIFY_OUTPUT_INVALID') {
    super(message);
    this.name = 'WritingQ1Q5GroupOutputError';
    this.code = code;
    this.retryable = true;
  }
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new WritingQ1Q5GroupOutputError(`${label} must be an object.`);
  }
  return value;
}

function parseJson(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) {
    throw new WritingQ1Q5GroupOutputError('result_json must contain JSON.');
  }
  try {
    return object(JSON.parse(value), 'result_json');
  } catch (error) {
    if (error instanceof WritingQ1Q5GroupOutputError) throw error;
    throw new WritingQ1Q5GroupOutputError('result_json is not valid JSON.');
  }
}

function parseWritingQ1Q5GroupResult(value, expected = {}) {
  const input = parseJson(value);
  const unknown = Object.keys(input).filter(field => !ALLOWED_RESULT_FIELDS.has(field));
  if (unknown.length) {
    throw new WritingQ1Q5GroupOutputError(`Unknown Writing Q1-Q5 group result fields: ${unknown.join(', ')}.`);
  }
  if (input.schema_version !== RESULT_SCHEMA_VERSION) {
    throw new WritingQ1Q5GroupOutputError(`Unsupported Writing Q1-Q5 group schema: ${input.schema_version}.`);
  }
  if (input.group_code !== 'WRITE_SENTENCE_PICTURE') {
    throw new WritingQ1Q5GroupOutputError('group_code must be WRITE_SENTENCE_PICTURE.');
  }
  const jobId = String(input.job_id || '').trim();
  const keycode = String(input.keycode || '').trim().toUpperCase();
  if (!jobId || !keycode) {
    throw new WritingQ1Q5GroupOutputError('Writing Q1-Q5 group identity is required.');
  }
  if (expected.jobId && jobId !== String(expected.jobId)) {
    throw new WritingQ1Q5GroupOutputError('Writing Q1-Q5 group job_id mismatch.');
  }
  if (expected.keycode && keycode !== String(expected.keycode).trim().toUpperCase()) {
    throw new WritingQ1Q5GroupOutputError('Writing Q1-Q5 group keycode mismatch.');
  }
  const groupFinalScore = Number(input.group_final_score);
  if (!Number.isInteger(groupFinalScore) || groupFinalScore < 0 || groupFinalScore > 3) {
    throw new WritingQ1Q5GroupOutputError('group_final_score must be an integer from 0 to 3.');
  }
  if (input.status !== 'COMPLETED') {
    throw new WritingQ1Q5GroupOutputError('Writing Q1-Q5 group result is not completed.');
  }
  const rawTotal = Number(input.group_raw_total);
  const average = Number(input.group_average);
  const questionScores = input.question_scores;
  if (!Number.isInteger(rawTotal) || rawTotal < 0 || rawTotal > 15
      || !Number.isFinite(average) || average < 0 || average > 3
      || !Array.isArray(questionScores) || questionScores.length !== 5) {
    throw new WritingQ1Q5GroupOutputError('Writing Q1-Q5 aggregate evidence is invalid.');
  }
  const normalizedScores = questionScores.map(Number);
  if (normalizedScores.some(score => !Number.isInteger(score) || score < 0 || score > 3)
      || Number(input.group_score_max) !== 15
      || normalizedScores.reduce((sum, score) => sum + score, 0) !== rawTotal
      || Math.abs((rawTotal / 5) - average) > 0.001) {
    throw new WritingQ1Q5GroupOutputError('Writing Q1-Q5 aggregate arithmetic is inconsistent.');
  }
  const versions = object(input.versions, 'versions');
  const promptVersion = String(versions.group_prompt_version || '').trim();
  const policyVersion = String(versions.group_policy_version || '').trim();
  if (!promptVersion || !policyVersion) {
    throw new WritingQ1Q5GroupOutputError('Writing Q1-Q5 group versions are required.');
  }
  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    jobId,
    keycode,
    groupCode: 'WRITE_SENTENCE_PICTURE',
    groupFinalScore,
    groupRawTotal: rawTotal,
    groupAverage: average,
    questionScores: normalizedScores,
    appliedRules: Array.isArray(input.applied_rules) ? input.applied_rules.map(String) : [],
    versions: { groupPromptVersion: promptVersion, groupPolicyVersion: policyVersion },
  };
}

module.exports = {
  RESULT_SCHEMA_VERSION,
  WritingQ1Q5GroupOutputError,
  parseWritingQ1Q5GroupResult,
};
