const { fetchJson, joinUrl } = require('./http');
const { normalizeDeepSeekUsage, normalizeFinishReason } = require('./normalize');

const name = 'deepseek';
const DEFAULT_BASE_URL = 'https://api.deepseek.com';

function headers(apiKey) {
  return { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` };
}

function jsonSystemPrompt(system, user) {
  const prompt = String(system || '');
  if (/json/i.test(`${prompt}\n${String(user || '')}`)) return prompt;
  return prompt ? `${prompt}\n\nReturn the answer as JSON.` : 'Return the answer as JSON.';
}

async function generate(options) {
  const body = {
    model: options.model,
    messages: [
      { role: 'system', content: jsonSystemPrompt(options.system, options.user) },
      { role: 'user', content: String(options.user || '') },
    ],
    response_format: { type: 'json_object' },
  };
  if (options.temperature !== undefined) body.temperature = options.temperature;
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
    finishReason: normalizeFinishReason(name, choice.finish_reason),
    usage: normalizeDeepSeekUsage(raw.usage),
    raw,
  };
}

async function countTokens({ system, user }) {
  const characters = String(system || '').length + String(user || '').length;
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

module.exports = { name, generate, countTokens, check, jsonSystemPrompt, DEFAULT_BASE_URL };
