// DeepSeek adapter: OpenAI-style chat API, JSON mode without native schema, thinking toggle.
const { fetchJson, joinUrl } = require('../http');
const { nonNegativeInteger } = require('../normalize');

const name = 'deepseek';
const label = 'DeepSeek';
const capabilities = Object.freeze({
  nativeSchema: false,
  thinking: '"Tắt" = tắt hẳn suy nghĩ; các mức khác = bật',
  outputFormat: 'JSON mode + schema đưa vào system prompt, AI Core tự kiểm',
});

function normalizeUsage(usage = {}) {
  const details = usage.completion_tokens_details || {};
  const cachedInput = nonNegativeInteger(usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens);
  const explicitMiss = usage.prompt_cache_miss_tokens;
  const input = explicitMiss === undefined
    ? Math.max(0, nonNegativeInteger(usage.prompt_tokens) - cachedInput)
    : nonNegativeInteger(explicitMiss);
  return { input, cachedInput, output: nonNegativeInteger(usage.completion_tokens), thinking: nonNegativeInteger(details.reasoning_tokens) };
}

function normalizeFinishReason(reason) {
  const value = String(reason || '').toUpperCase();
  if (value === 'STOP') return 'stop';
  if (value === 'LENGTH') return 'length';
  if (value === 'CONTENT_FILTER') return 'safety';
  return 'other';
}
const DEFAULT_BASE_URL = 'https://api.deepseek.com';

function headers(apiKey) {
  return { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` };
}

// DeepSeek only guarantees "some JSON" (json_object mode); it never sees a schema natively.
// So the adapter states the exact output schema in the system message — the provider-specific
// equivalent of Gemini's responseSchema. Without it the model invents field names and shapes.
function jsonSystemPrompt(system, user, schema) {
  const prompt = String(system || '');
  const parts = [prompt];
  if (schema && typeof schema === 'object' && Object.keys(schema).length) {
    parts.push(`### REQUIRED OUTPUT FORMAT
Return ONE JSON object that validates against this JSON Schema. Use exactly these property names and nesting; the top level must be an object, never a bare array; add no other properties.
${JSON.stringify(schema)}`);
  } else if (!/json/i.test(`${prompt}\n${String(user || '')}`)) {
    parts.push('Return the answer as JSON.');
  }
  return parts.filter(Boolean).join('\n\n');
}

async function generate(options) {
  const body = {
    model: options.model,
    messages: [
      { role: 'system', content: jsonSystemPrompt(options.system, options.user, options.schema) },
      { role: 'user', content: String(options.user || '') },
    ],
    response_format: { type: 'json_object' },
  };
  if (options.temperature !== undefined) body.temperature = options.temperature;
  // DeepSeek V4 thinks by default; 'off' disables it, any level keeps it on.
  if (options.thinkingMode && options.thinkingMode !== 'default') {
    body.thinking = { type: options.thinkingMode === 'off' ? 'disabled' : 'enabled' };
  }
  if (options.maxOutputTokens !== undefined) body.max_tokens = options.maxOutputTokens;

  const raw = await fetchJson(joinUrl(options.baseUrl || DEFAULT_BASE_URL, 'chat/completions'), {
    headers: headers(options.apiKey),
    body,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  });
  const choice = raw.choices?.[0] || {};
  return {
    text: typeof choice.message?.content === 'string' ? choice.message.content : '',
    finishReason: normalizeFinishReason(choice.finish_reason),
    usage: normalizeUsage(raw.usage),
    raw,
  };
}

async function countTokens({ system, user, schema }) {
  // Count what is really sent: the system message includes the injected schema.
  const sent = schema ? jsonSystemPrompt(system, user, schema) : String(system || '');
  const characters = sent.length + String(user || '').length;
  return Math.ceil(Math.ceil(characters / 3.5) * 1.1);
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
      models: (raw.data || []).map(model => model.id).filter(Boolean),
      modelDetails: (raw.data || []).filter(model => model.id).map(model => ({ id: model.id, contextWindow: null })),
    };
  } catch (error) {
    return { ok: false, ms: Date.now() - startedAt, error: { code: error.code, message: error.message } };
  }
}

module.exports = { name, label, capabilities, normalizeUsage, normalizeFinishReason, generate, countTokens, check, jsonSystemPrompt, DEFAULT_BASE_URL };
