'use strict';

// The one interface between the AI Core runtime (generic) and a provider integration (custom).
// Core code only ever talks to this contract; provider quirks never leak past an adapter.
//
// An adapter module exports:
//   name           string   stable id stored in aic_connections.provider (e.g. 'deepseek')
//   label          string   display name for the admin UI
//   capabilities   object   { nativeSchema: boolean, thinking: string, outputFormat: string } — descriptive, shown in UI
//   generate(opts) → { text, finishReason: 'stop'|'length'|'safety'|'other', usage: { input, cachedInput, output, thinking }, raw }
//                    opts: { apiKey, baseUrl, model, system, user, schema, temperature, thinkingMode, maxOutputTokens, timeoutMs, signal }
//                    The adapter must make the model honour `schema` (natively or by prompting) and map `thinkingMode`.
//   countTokens(opts) → number of input tokens that will really be sent (incl. anything the adapter injects)
//   check(opts)    → { ok, ms, models: string[], modelDetails: [{ id, contextWindow|null }], error? }
// Errors thrown must be AiCoreError (use ../http.js + ../normalize.js helpers) with `retryable` set.

const FINISH_REASONS = new Set(['stop', 'length', 'safety', 'other']);
const REQUIRED_FUNCTIONS = ['generate', 'countTokens', 'check'];

function assertAdapter(adapter) {
  const missing = [];
  if (!adapter || typeof adapter.name !== 'string' || !/^[a-z0-9_-]{2,40}$/.test(adapter.name)) missing.push('name');
  if (typeof adapter?.label !== 'string' || !adapter.label) missing.push('label');
  if (!adapter?.capabilities || typeof adapter.capabilities !== 'object') missing.push('capabilities');
  for (const fn of REQUIRED_FUNCTIONS) if (typeof adapter?.[fn] !== 'function') missing.push(fn);
  if (missing.length) throw new Error(`AI Core provider adapter "${adapter?.name || '?'}" is missing: ${missing.join(', ')}`);
  return adapter;
}

const count = value => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0);

// Core never trusts an adapter blindly: results are coerced to the contract shape.
function normalizeResult(result) {
  const usage = result?.usage || {};
  return {
    text: typeof result?.text === 'string' ? result.text : '',
    finishReason: FINISH_REASONS.has(result?.finishReason) ? result.finishReason : 'other',
    usage: { input: count(usage.input), cachedInput: count(usage.cachedInput), output: count(usage.output), thinking: count(usage.thinking) },
    raw: result?.raw ?? null,
  };
}

// Wrap an adapter so every call goes through the contract.
function bind(adapter) {
  assertAdapter(adapter);
  return Object.freeze({
    ...adapter,
    async generate(options) { return normalizeResult(await adapter.generate(options)); },
    async countTokens(options) { return count(await adapter.countTokens(options)); },
    async check(options) {
      const result = await adapter.check(options);
      const details = Array.isArray(result?.modelDetails)
        ? result.modelDetails
        : (result?.models || []).map(id => ({ id, contextWindow: null }));
      return { ...result, ok: Boolean(result?.ok), models: details.map(item => item.id), modelDetails: details };
    },
  });
}

function describe(adapter) {
  return { name: adapter.name, label: adapter.label, capabilities: { ...adapter.capabilities } };
}

module.exports = { assertAdapter, normalizeResult, bind, describe, FINISH_REASONS };
