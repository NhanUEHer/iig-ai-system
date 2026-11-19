'use strict';

// Provider registry — the ONLY place that lists integrations.
// Adding a provider = write adapters/<name>.js against ./contract.js and add one line below.
// Nothing in runtime/, guards/, pricing/, admin/ or the UI needs to change.
const { AiCoreError } = require('../errors');
const { bind, describe } = require('./contract');

const ADAPTERS = [
  require('./adapters/gemini'),
  require('./adapters/deepseek'),
];
const TEST_ADAPTER = require('./adapters/fake');

const registry = new Map(ADAPTERS.map(adapter => [adapter.name, bind(adapter)]));
const fake = bind(TEST_ADAPTER);

function get(name, env = process.env) {
  if (env.AI_CORE_PROVIDER_OVERRIDE === 'fake' || name === 'fake') return fake;
  const adapter = registry.get(name);
  if (!adapter) throw new AiCoreError('CONFIG_MISSING', 'Unsupported AI provider.');
  return adapter;
}

const has = name => registry.has(name);
const names = () => [...registry.keys()];
const list = () => [...registry.values()].map(describe);

module.exports = { get, has, names, list, fake: TEST_ADAPTER };
