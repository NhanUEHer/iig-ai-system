const { fetchJson, joinUrl } = require('./http');
const { normalizeFinishReason, normalizeGeminiUsage } = require('./normalize');

const name = 'gemini';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const SCHEMA_KEYS = new Set([
  'type', 'properties', 'required', 'items', 'enum', 'description', 'nullable', 'minItems', 'maxItems',
]);

function toResponseSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toResponseSchema);
  if (!schema || typeof schema !== 'object') return schema;

  const converted = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!SCHEMA_KEYS.has(key)) continue;
    if (key === 'properties') {
      converted.properties = Object.fromEntries(
        Object.entries(value || {}).map(([property, definition]) => [property, toResponseSchema(definition)]),
      );
    } else if (key === 'items') {
      converted.items = toResponseSchema(value);
    } else {
      converted[key] = Array.isArray(value) ? [...value] : value;
    }
  }
  return converted;
}

function headers(apiKey) {
  return { 'content-type': 'application/json', 'x-goog-api-key': apiKey };
}

function contents(system, user) {
  const request = { contents: [{ role: 'user', parts: [{ text: String(user || '') }] }] };
  if (system) request.systemInstruction = { parts: [{ text: String(system) }] };
  return request;
}

async function generate(options) {
  const body = contents(options.system, options.user);
  body.generationConfig = {
    responseMimeType: 'application/json',
    responseSchema: toResponseSchema(options.schema || {}),
  };
  if (options.temperature !== undefined) body.generationConfig.temperature = options.temperature;
  if (options.maxOutputTokens !== undefined) {
    body.generationConfig.maxOutputTokens = options.maxOutputTokens;
  }

  const raw = await fetchJson(
    joinUrl(options.baseUrl || DEFAULT_BASE_URL, `models/${encodeURIComponent(options.model)}:generateContent`),
    {
      headers: headers(options.apiKey),
      body,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    },
  );
  const candidate = raw.candidates?.[0] || {};
  const text = (candidate.content?.parts || [])
    .map(part => (typeof part.text === 'string' ? part.text : ''))
    .join('');
  return {
    text,
    finishReason: normalizeFinishReason(name, candidate.finishReason),
    usage: normalizeGeminiUsage(raw.usageMetadata),
    raw,
  };
}

async function countTokens(options) {
  const raw = await fetchJson(
    joinUrl(options.baseUrl || DEFAULT_BASE_URL, `models/${encodeURIComponent(options.model)}:countTokens`),
    {
      headers: headers(options.apiKey),
      body: contents(options.system, options.user),
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    },
  );
  return Number(raw.totalTokens) || 0;
}

async function check({ apiKey, baseUrl, timeoutMs = 10000, signal } = {}) {
  const startedAt = Date.now();
  try {
    const raw = await fetchJson(joinUrl(baseUrl || DEFAULT_BASE_URL, 'models'), {
      method: 'GET', headers: headers(apiKey), timeoutMs, signal,
    });
    return {
      ok: true,
      ms: Date.now() - startedAt,
      models: (raw.models || []).map(model => String(model.name || '').replace(/^models\//, '')).filter(Boolean),
    };
  } catch (error) {
    return { ok: false, ms: Date.now() - startedAt, error: { code: error.code, message: error.message } };
  }
}

module.exports = { name, generate, countTokens, check, toResponseSchema, DEFAULT_BASE_URL };
