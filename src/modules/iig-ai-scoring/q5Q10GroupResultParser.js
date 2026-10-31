const RESULT_SCHEMA_VERSION = 'respond-q5-q10-group-result-v1';
const GROUP_CODE = 'RESPOND_Q5_Q10';

class Q5Q10GroupOutputError extends Error {
  constructor(message, code = 'IIG_AI_Q5_Q10_GROUP_DIFY_OUTPUT_INVALID') {
    super(message);
    this.name = 'Q5Q10GroupOutputError';
    this.code = code;
    this.retryable = true;
  }
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Q5Q10GroupOutputError(`${label} must be an object.`);
  }
  return value;
}

function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Q5Q10GroupOutputError(`${label} must be a non-empty string.`);
  }
  return value.normalize('NFKC').trim();
}

function parseJson(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Q5Q10GroupOutputError('result_json must contain JSON.');
  }
  try {
    return object(JSON.parse(value), 'result_json');
  } catch (error) {
    if (error instanceof Q5Q10GroupOutputError) throw error;
    throw new Q5Q10GroupOutputError('result_json is not valid JSON.');
  }
}

function parseQ5Q10GroupResult(value, expected = {}) {
  const input = parseJson(value);
  if (input.schema_version !== RESULT_SCHEMA_VERSION) {
    throw new Q5Q10GroupOutputError(`Unsupported group schema: ${input.schema_version || '(empty)'}.`);
  }
  if (input.group_code !== GROUP_CODE) {
    throw new Q5Q10GroupOutputError(`group_code must be ${GROUP_CODE}.`);
  }
  if (input.status !== 'COMPLETED') {
    throw new Q5Q10GroupOutputError(`Group status is ${input.status || '(empty)'}.`);
  }
  const jobId = text(input.job_id, 'job_id');
  const keycode = text(input.keycode, 'keycode');
  if (expected.jobId && jobId !== String(expected.jobId)) {
    throw new Q5Q10GroupOutputError('Group job_id does not match.');
  }
  if (expected.keycode && keycode !== String(expected.keycode)) {
    throw new Q5Q10GroupOutputError('Group keycode does not match.');
  }
  const groupFinalScore = Number(input.group_final_score);
  if (!Number.isInteger(groupFinalScore) || groupFinalScore < 0 || groupFinalScore > 3) {
    throw new Q5Q10GroupOutputError('group_final_score must be an integer from 0 to 3.');
  }
  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    jobId,
    keycode,
    groupCode: GROUP_CODE,
    status: 'COMPLETED',
    groupFinalScore,
    appliedRules: Array.isArray(input.applied_rules)
      ? input.applied_rules.map((item, index) => text(item, `applied_rules[${index}]`))
      : [],
    versions: object(input.versions || {}, 'versions'),
  };
}

module.exports = {
  RESULT_SCHEMA_VERSION,
  GROUP_CODE,
  Q5Q10GroupOutputError,
  parseQ5Q10GroupResult,
};
