const assert = require('node:assert/strict');
const test = require('node:test');

const providers = require('../src/modules/ai-core/providers');
const gemini = require('../src/modules/ai-core/providers/adapters/gemini');
const deepseek = require('../src/modules/ai-core/providers/adapters/deepseek');
const fake = require('../src/modules/ai-core/providers/adapters/fake');

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

test.afterEach(() => {
  global.fetch = undefined;
  fake.clear();
});

test('Gemini sends system instruction and converted response schema, then normalizes usage', async () => {
  let request;
  global.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return response({
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: 'MAX_TOKENS' }],
      usageMetadata: {
        promptTokenCount: 100, cachedContentTokenCount: 40,
        candidatesTokenCount: 20, thoughtsTokenCount: 7,
      },
    });
  };

  const result = await gemini.generate({
    apiKey: 'secret-key', model: 'gemini-2.5-flash', system: 'System', user: 'User',
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object', additionalProperties: false, required: ['ok'],
      properties: { ok: { type: 'boolean', description: 'result', minimum: 0 } },
    },
    temperature: 0.2, maxOutputTokens: 100, timeoutMs: 1000,
  });

  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  assert.equal(request.options.headers['x-goog-api-key'], 'secret-key');
  assert.deepEqual(request.body.systemInstruction, { parts: [{ text: 'System' }] });
  assert.deepEqual(request.body.generationConfig.responseSchema, {
    type: 'object', required: ['ok'], properties: { ok: { type: 'boolean', description: 'result' } },
  });
  assert.deepEqual(result.usage, { input: 60, cachedInput: 40, output: 27, thinking: 7 });
  assert.equal(result.finishReason, 'length');
  assert.equal(result.text, '{"ok":true}');
});

test('Gemini countTokens uses the provider endpoint', async () => {
  let request;
  global.fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return response({ totalTokens: 42 });
  };
  assert.equal(await gemini.countTokens({ apiKey: 'key', model: 'model', system: 's', user: 'u' }), 42);
  assert.match(request.url, /models\/model:countTokens$/);
  assert.deepEqual(request.body.generateContentRequest.systemInstruction, { parts: [{ text: 's' }] });
  assert.equal(request.body.generateContentRequest.model, 'models/model');
});

test('DeepSeek requests JSON, adds a JSON instruction only when needed, and normalizes usage', async () => {
  const bodies = [];
  global.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return response({
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
      usage: {
        prompt_cache_miss_tokens: 70, prompt_cache_hit_tokens: 30, completion_tokens: 25,
        completion_tokens_details: { reasoning_tokens: 9 },
      },
    });
  };
  const options = {
    apiKey: 'deep-secret', model: 'deepseek-chat', system: 'Be concise.', user: 'Answer.',
    temperature: 0, maxOutputTokens: 80,
  };
  const result = await deepseek.generate(options);
  await deepseek.generate({ ...options, system: 'Return JSON.' });

  assert.equal(bodies[0].messages[0].content, 'Be concise.\n\nReturn the answer as JSON.');
  assert.equal(bodies[1].messages[0].content, 'Return JSON.');
  assert.deepEqual(bodies[0].response_format, { type: 'json_object' });
  assert.equal(bodies[0].max_tokens, 80);
  assert.deepEqual(result.usage, { input: 70, cachedInput: 30, output: 25, thinking: 9 });
  assert.equal(result.finishReason, 'stop');
  assert.equal(await deepseek.countTokens({ system: '1234567', user: '' }), 3);
});

test('provider errors map safely without returning keys or key-bearing URLs', async () => {
  for (const [status, code, retryable] of [
    [401, 'AUTH_FAILED', false], [429, 'PROVIDER_DOWN', true], [503, 'PROVIDER_DOWN', true],
    [504, 'TIMEOUT', true],
  ]) {
    global.fetch = async () => response({ error: { message: 'leaked-key' } }, status);
    await assert.rejects(
      gemini.generate({ apiKey: 'leaked-key', baseUrl: 'https://host.invalid/?key=leaked-key', model: 'm' }),
      error => error.code === code && error.retryable === retryable
        && !error.message.includes('leaked-key') && !error.message.includes('host.invalid'),
    );
  }
});

test('provider timeout aborts fetch and maps to TIMEOUT', async () => {
  global.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  await assert.rejects(
    deepseek.generate({ apiKey: 'key', model: 'm', timeoutMs: 5 }),
    error => error.code === 'TIMEOUT' && error.retryable === true,
  );
});

test('finish reasons, fake queue, and provider selection follow the common interface', async () => {
  const geminiAdapter = require('../src/modules/ai-core/providers/adapters/gemini');
  const deepseekAdapter = require('../src/modules/ai-core/providers/adapters/deepseek');
  assert.equal(geminiAdapter.normalizeFinishReason('SAFETY'), 'safety');
  assert.equal(geminiAdapter.normalizeFinishReason('RECITATION'), 'safety');
  assert.equal(deepseekAdapter.normalizeFinishReason('length'), 'length');
  assert.equal(deepseekAdapter.normalizeFinishReason('content_filter'), 'safety');
  assert.equal(gemini.toResponseSchema({ oneOf: [], type: 'string', enum: ['a'] }).oneOf, undefined);
  fake.enqueue({ text: '{}', usage: { input: 2 }, finishReason: 'safety' });
  assert.deepEqual(await fake.generate({}), {
    text: '{}', usage: { input: 2, cachedInput: 0, output: 0, thinking: 0 },
    finishReason: 'safety', raw: null,
  });
  assert.equal(providers.get('gemini').name, 'gemini');
  assert.equal(providers.get('deepseek', { AI_CORE_PROVIDER_OVERRIDE: 'fake' }).name, 'fake');
});

test('thinking mode maps to DeepSeek thinking.type and Gemini thinkingConfig', async () => {
  const gemini = require('../src/modules/ai-core/providers/adapters/gemini');
  assert.deepEqual(gemini.thinkingConfig('gemini-3.8-flash', 'off'), { thinkingLevel: 'low' });
  assert.deepEqual(gemini.thinkingConfig('gemini-3.8-flash', 'low'), { thinkingLevel: 'low' });
  assert.deepEqual(gemini.thinkingConfig('gemini-2.5-flash', 'off'), { thinkingBudget: 0 });
  assert.deepEqual(gemini.thinkingConfig('gemini-2.5-pro', 'off'), { thinkingBudget: 128 });
  assert.equal(gemini.thinkingConfig('gemini-3.8-flash', 'default'), null);

  const deepseek = require('../src/modules/ai-core/providers/adapters/deepseek');
  const original = global.fetch;
  const bodies = [];
  global.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }], usage: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    await deepseek.generate({ apiKey: 'k', model: 'deepseek-flash', system: 'json', user: 'u', thinkingMode: 'off' });
    await deepseek.generate({ apiKey: 'k', model: 'deepseek-flash', system: 'json', user: 'u', thinkingMode: 'high' });
    await deepseek.generate({ apiKey: 'k', model: 'deepseek-flash', system: 'json', user: 'u', thinkingMode: 'default' });
  } finally { global.fetch = original; }
  assert.deepEqual(bodies[0].thinking, { type: 'disabled' });
  assert.deepEqual(bodies[1].thinking, { type: 'enabled' });
  assert.equal(bodies[2].thinking, undefined);
});

test('DeepSeek receives the output schema in its system message (no native schema support)', async () => {
  const deepseekAdapter = require('../src/modules/ai-core/providers/adapters/deepseek');
  const schema = { type: 'object', required: ['w'], properties: { w: { type: 'array' } } };
  const prompt = deepseekAdapter.jsonSystemPrompt('You are a teacher.', 'u', schema);
  assert.match(prompt, /REQUIRED OUTPUT FORMAT/);
  assert.ok(prompt.includes(JSON.stringify(schema)));
  assert.ok(await deepseekAdapter.countTokens({ system: 's', user: 'u', schema }) > await deepseekAdapter.countTokens({ system: 's', user: 'u' }));
});


test('registry is the only provider list; every adapter satisfies the contract and results are coerced', async () => {
  const registry = require('../src/modules/ai-core/providers');
  const { assertAdapter, normalizeResult } = require('../src/modules/ai-core/providers/contract');
  assert.deepEqual(registry.names(), ['gemini', 'deepseek']);
  for (const item of registry.list()) assert.ok(item.label && item.capabilities);
  assert.throws(() => assertAdapter({ name: 'x1', label: 'X' }), /missing: capabilities, generate, countTokens, check/);
  assert.deepEqual(normalizeResult({ text: 5, finishReason: 'weird', usage: { input: -3, output: '7' } }),
    { text: '', finishReason: 'other', usage: { input: 0, cachedInput: 0, output: 7, thinking: 0 }, raw: null });
  assert.throws(() => registry.get('openai', {}), /Unsupported AI provider/);
});
