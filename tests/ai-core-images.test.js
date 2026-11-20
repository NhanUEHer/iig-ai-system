const assert = require('node:assert/strict');
const test = require('node:test');

const { createRunner } = require('../src/modules/ai-core/runtime/runner');
const { normalizeImages } = require('../src/modules/ai-core/runtime/images');
const gemini = require('../src/modules/ai-core/providers/adapters/gemini');
const deepseek = require('../src/modules/ai-core/providers/adapters/deepseek');
const fake = require('../src/modules/ai-core/providers/adapters/fake');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const schema = { type: 'object', required: ['text'], properties: { text: { type: 'string' } } };

function spyAdapter({ vision = true, replies = ['{"text":"ok"}'] } = {}) {
  const calls = [];
  const tokenCalls = [];
  return {
    calls, tokenCalls,
    name: vision ? 'spy-vision' : 'spy-text', label: 'Spy',
    capabilities: { vision },
    async generate(options) { calls.push(options); return { text: replies.shift(), finishReason: 'stop', usage: { input: 10, output: 5 } }; },
    async countTokens(options) { tokenCalls.push(options); return 10 + (options.images?.length || 0) * 258; },
    async check() { return { ok: true }; },
  };
}

function harness(adapter, { fallback, repair = false } = {}) {
  const logs = [];
  const runner = createRunner({
    registry: { async load() { return {
      agent: { id: 'a', key: 'cs.image.describe', status: 'active', maxConcurrency: 2, maxCostPerCallUsd: 1 },
      version: {
        id: 'v', version: 1, connectionId: 'main', model: 'm', systemPrompt: 'Describe.', userTemplate: 'Image {{n}}',
        variables: [{ name: 'n' }], outputSchema: schema, maxInputTokens: 5000, maxOutputTokens: 100, timeoutMs: 1000,
        maxRetries: 0, repairInvalidJson: repair,
        ...(fallback ? { fallbackConnectionId: 'backup', fallbackModel: 'f' } : {}),
      },
    }; } },
    providers: { get: name => (name === 'backup' ? fallback : adapter) },
    connectionStore: { async get(id) { return { id, provider: id, status: 'active', apiKey: 'k' }; } },
    priceStore: { async getPrice() { return { in: 0, cachedIn: 0, out: 0 }; } },
    callLog: { async write(entry) { logs.push(entry); return 'call'; } },
    spend: { bump() {} },
    guards: { budget: async state => state, limiter: async (_s, next) => next(), retry: async (_s, next) => next() },
  });
  return { runner, logs };
}

test('normalizeImages hashes buffers/base64 and rejects bad input', () => {
  const [fromBuffer] = normalizeImages([{ mimeType: 'image/png', data: PNG }]);
  const [fromBase64] = normalizeImages([{ mime: 'IMAGE/PNG', data: PNG.toString('base64') }]);
  assert.equal(fromBuffer.data, PNG.toString('base64'));
  assert.equal(fromBuffer.sha256, fromBase64.sha256);
  assert.equal(fromBuffer.bytes, PNG.length);
  assert.deepEqual(normalizeImages(undefined), []);
  assert.throws(() => normalizeImages([{ mimeType: 'application/pdf', data: PNG }]), { code: 'VARIABLES_INVALID' });
  assert.throws(() => normalizeImages([{ mimeType: 'image/png', data: '' }]), { code: 'VARIABLES_INVALID' });
  assert.throws(() => normalizeImages([{ mimeType: 'image/png', data: Buffer.alloc(5 * 1024 * 1024 + 1) }]), { code: 'INPUT_TOO_LARGE' });
  assert.throws(() => normalizeImages(new Array(11).fill({ mimeType: 'image/png', data: PNG })), { code: 'VARIABLES_INVALID' });
});

test('images reach the adapter and the token count, but the log keeps only the hash', async () => {
  const adapter = spyAdapter();
  const { runner, logs } = harness(adapter);
  const result = await runner.execute({ key: 'cs.image.describe', variables: { n: 1 }, images: [{ mimeType: 'image/png', data: PNG }] });
  assert.deepEqual(result.data, { text: 'ok' });
  assert.equal(adapter.calls[0].images[0].data, PNG.toString('base64'));
  assert.equal(adapter.tokenCalls[0].images.length, 1);
  const preview = logs[0].requestPreview;
  assert.deepEqual(Object.keys(preview), ['images', 'system', 'user']);
  assert.deepEqual(Object.keys(preview.images[0]), ['mimeType', 'bytes', 'sha256']);
  assert.ok(!JSON.stringify(logs[0]).includes(PNG.toString('base64')));
});

test('text-only provider is blocked before any call; calls without images are unchanged', async () => {
  const adapter = spyAdapter({ vision: false });
  const { runner, logs } = harness(adapter);
  await assert.rejects(runner.execute({ key: 'x', variables: {}, images: [{ mimeType: 'image/png', data: PNG }] }), { code: 'CONFIG_MISSING' });
  assert.equal(adapter.calls.length, 0);
  assert.equal(logs[0].status, 'blocked');
  await runner.execute({ key: 'x', variables: {} });
  assert.deepEqual(adapter.calls[0].images, []);
  assert.deepEqual(Object.keys(logs[1].requestPreview), ['system', 'user']);
});

test('JSON repair call does not resend the images', async () => {
  const adapter = spyAdapter({ replies: ['not json', '{"text":"fixed"}'] });
  const { runner } = harness(adapter, { repair: true });
  const result = await runner.execute({ key: 'x', variables: {}, images: [{ mimeType: 'image/png', data: PNG }] });
  assert.equal(result.data.text, 'fixed');
  assert.equal(adapter.calls[0].images.length, 1);
  assert.deepEqual(adapter.calls[1].images, []);
});

test('a text-only fallback never silently drops the images', async () => {
  const failing = spyAdapter();
  failing.generate = async () => { throw Object.assign(new Error('down'), { code: 'PROVIDER_DOWN', retryable: true }); };
  const backup = spyAdapter({ vision: false });
  const { runner } = harness(failing, { fallback: backup });
  await assert.rejects(runner.execute({ key: 'x', variables: {}, images: [{ mimeType: 'image/png', data: PNG }] }));
  assert.equal(backup.calls.length, 0);
});

test('Gemini puts inlineData before the prompt text; DeepSeek refuses images', async () => {
  const body = gemini.contents('sys', 'Describe it', [{ mimeType: 'image/png', data: 'AAAA' }]);
  assert.deepEqual(body.contents[0].parts, [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }, { text: 'Describe it' }]);
  assert.deepEqual(gemini.contents('sys', 'x').contents[0].parts, [{ text: 'x' }]);
  assert.equal(gemini.capabilities.vision, true);
  assert.equal(deepseek.capabilities.vision, false);
  await assert.rejects(deepseek.generate({ model: 'deepseek-chat', user: 'x', images: [{ mimeType: 'image/png', data: 'AAAA' }] }), { code: 'CONFIG_MISSING' });
  assert.equal(await fake.countTokens({ system: '', user: '', images: [{}, {}] }), 516);
});
