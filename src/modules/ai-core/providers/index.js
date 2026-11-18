const { AiCoreError } = require('../errors');
const gemini = require('./gemini');
const deepseek = require('./deepseek');
const fake = require('./fake');

const adapters = Object.freeze({ gemini, deepseek, fake });

function get(name, env = process.env) {
  const selected = env.AI_CORE_PROVIDER_OVERRIDE === 'fake' ? 'fake' : name;
  const adapter = adapters[selected];
  if (!adapter) throw new AiCoreError('CONFIG_MISSING', 'Unsupported AI provider.');
  return adapter;
}

module.exports = { get, gemini, deepseek, fake };
