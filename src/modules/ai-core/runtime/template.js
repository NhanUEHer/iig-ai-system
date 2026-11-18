const { AiCoreError } = require('../errors');

const PLACEHOLDER = /{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}/g;

function renderedValue(value) {
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  if (value === null) return 'null';
  return String(value);
}

function render(template, values = {}, definitions = []) {
  const supplied = values && typeof values === 'object' ? values : {};
  const hasValue = name => Object.prototype.hasOwnProperty.call(supplied, name)
    && supplied[name] !== undefined;
  const missing = definitions
    .filter(definition => definition?.required && !hasValue(definition.name))
    .map(definition => definition.name);
  if (missing.length > 0) {
    throw new AiCoreError('VARIABLES_INVALID', `Missing required variables: ${missing.join(', ')}.`);
  }

  const allowed = new Set(definitions.map(definition => definition?.name).filter(Boolean));
  return String(template || '').replace(PLACEHOLDER, (_match, name) => {
    if (!allowed.has(name) || !hasValue(name)) return '';
    return renderedValue(supplied[name]);
  });
}

module.exports = { render, renderTemplate: render, PLACEHOLDER };
