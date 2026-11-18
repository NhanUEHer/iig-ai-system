const Ajv2020 = require('ajv/dist/2020');

const ajv = new Ajv2020({ allErrors: true, strict: false });

function unwrapJsonFence(text) {
  const source = String(text || '').trim();
  const match = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : source;
}

function parse(text) {
  try {
    return { value: JSON.parse(unwrapJsonFence(text)), errors: [] };
  } catch (error) {
    return { value: undefined, errors: [`Invalid JSON: ${error.message}`] };
  }
}

function readableError(error) {
  const path = error.instancePath ? `$${error.instancePath}` : '$';
  if (error.keyword === 'required') return `${path} is missing required property ${error.params.missingProperty}`;
  if (error.keyword === 'additionalProperties') {
    return `${path} has unexpected property ${error.params.additionalProperty}`;
  }
  return `${path} ${error.message || 'is invalid'}`;
}

function validate(schema, value) {
  try {
    const validator = ajv.compile(schema || {});
    const valid = validator(value);
    return { valid: Boolean(valid), errors: valid ? [] : validator.errors.map(readableError) };
  } catch (error) {
    return { valid: false, errors: [`Invalid output schema: ${error.message}`] };
  }
}

function parseAndValidate(text, outputSchema) {
  const parsed = parse(text);
  if (parsed.errors.length > 0) return { valid: false, data: undefined, errors: parsed.errors };
  const checked = validate(outputSchema, parsed.value);
  return { valid: checked.valid, data: parsed.value, errors: checked.errors };
}

module.exports = { parse, parseJson: parse, validate, validateSchema: validate, parseAndValidate, unwrapJsonFence };
