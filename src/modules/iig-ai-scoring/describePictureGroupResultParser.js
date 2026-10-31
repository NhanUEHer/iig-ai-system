const RESULT_SCHEMA_VERSION = 'describe-picture-group-result-v1';
const ALLOWED_RESULT_FIELDS = new Set([
  'schema_version', 'group_code', 'group_final_score', 'versions',
]);

class DescribePictureGroupOutputError extends Error {
  constructor(message, code = 'IIG_AI_DESCRIBE_PICTURE_GROUP_DIFY_OUTPUT_INVALID') {
    super(message);
    this.name = 'DescribePictureGroupOutputError';
    this.code = code;
    this.retryable = true;
  }
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DescribePictureGroupOutputError(`${label} must be an object.`);
  }
  return value;
}

function parseJson(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) {
    throw new DescribePictureGroupOutputError('result_json must contain JSON.');
  }
  try {
    return object(JSON.parse(value), 'result_json');
  } catch (error) {
    if (error instanceof DescribePictureGroupOutputError) throw error;
    throw new DescribePictureGroupOutputError('result_json is not valid JSON.');
  }
}

function parseDescribePictureGroupResult(value) {
  const input = parseJson(value);
  const unknown = Object.keys(input).filter(field => !ALLOWED_RESULT_FIELDS.has(field));
  if (unknown.length) {
    throw new DescribePictureGroupOutputError(`Unknown Describe Picture group result fields: ${unknown.join(', ')}.`);
  }
  if (input.schema_version !== RESULT_SCHEMA_VERSION) {
    throw new DescribePictureGroupOutputError(`Unsupported Describe Picture group schema: ${input.schema_version}.`);
  }
  if (input.group_code !== 'DESCRIBE_PICTURE') {
    throw new DescribePictureGroupOutputError('group_code must be DESCRIBE_PICTURE.');
  }
  const groupFinalScore = Number(input.group_final_score);
  if (!Number.isInteger(groupFinalScore) || groupFinalScore < 0 || groupFinalScore > 3) {
    throw new DescribePictureGroupOutputError('group_final_score must be an integer from 0 to 3.');
  }
  const versions = object(input.versions, 'versions');
  if (typeof versions.group_prompt !== 'string' || !versions.group_prompt.trim()) {
    throw new DescribePictureGroupOutputError('versions.group_prompt is required.');
  }
  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    groupCode: 'DESCRIBE_PICTURE',
    groupFinalScore,
    versions: { groupPrompt: versions.group_prompt.trim() },
  };
}

module.exports = {
  RESULT_SCHEMA_VERSION,
  DescribePictureGroupOutputError,
  parseDescribePictureGroupResult,
};
