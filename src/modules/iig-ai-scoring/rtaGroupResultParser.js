const RESULT_SCHEMA_VERSION = 'rta-group-result-v1';
const ALLOWED_RESULT_FIELDS = new Set([
  'schema_version', 'job_id', 'keycode', 'group_code', 'group_final_score',
  'group_score_rationale', 'versions',
]);

class RtaGroupOutputError extends Error {
  constructor(message, code = 'IIG_AI_RTA_GROUP_DIFY_OUTPUT_INVALID') {
    super(message);
    this.name = 'RtaGroupOutputError';
    this.code = code;
    this.retryable = true;
  }
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RtaGroupOutputError(`${label} must be an object.`);
  }
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new RtaGroupOutputError(`${label} must be a non-empty string.`);
  }
  return value.normalize('NFKC').trim();
}

function parseJson(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) {
    throw new RtaGroupOutputError('result_json must contain JSON.');
  }
  try {
    return object(JSON.parse(value), 'result_json');
  } catch (error) {
    if (error instanceof RtaGroupOutputError) throw error;
    throw new RtaGroupOutputError('result_json is not valid JSON.');
  }
}

function parseRtaGroupResult(value, expected = {}) {
  const input = parseJson(value);
  const unknown = Object.keys(input).filter(field => !ALLOWED_RESULT_FIELDS.has(field));
  if (unknown.length) {
    throw new RtaGroupOutputError(`Unknown RTA group result fields: ${unknown.join(', ')}.`);
  }
  if (input.schema_version !== RESULT_SCHEMA_VERSION) {
    throw new RtaGroupOutputError(`Unsupported RTA group schema: ${input.schema_version}.`);
  }
  if (input.group_code !== 'READ_TEXT_ALOUD') {
    throw new RtaGroupOutputError('group_code must be READ_TEXT_ALOUD.');
  }
  const jobId = text(input.job_id, 'job_id');
  const keycode = text(input.keycode, 'keycode');
  if (expected.jobId && jobId !== String(expected.jobId)) {
    throw new RtaGroupOutputError('RTA group job_id does not match the request.');
  }
  if (expected.keycode && keycode !== String(expected.keycode)) {
    throw new RtaGroupOutputError('RTA group keycode does not match the request.');
  }
  const groupFinalScore = Number(input.group_final_score);
  if (!Number.isInteger(groupFinalScore) || groupFinalScore < 0 || groupFinalScore > 3) {
    throw new RtaGroupOutputError('group_final_score must be an integer from 0 to 3.');
  }
  const versions = object(input.versions, 'versions');
  if (typeof versions.group_prompt !== 'string' || !versions.group_prompt.trim()) {
    throw new RtaGroupOutputError('versions.group_prompt is required.');
  }
  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    jobId,
    keycode,
    groupCode: 'READ_TEXT_ALOUD',
    groupFinalScore,
    versions: { groupPrompt: versions.group_prompt.trim() },
  };
}

module.exports = {
  RESULT_SCHEMA_VERSION,
  RtaGroupOutputError,
  parseRtaGroupResult,
};
