const assert = require('node:assert/strict');
const test = require('node:test');

const fake = require('../src/modules/ai-core/providers/fake');
const { createRegistry, CACHE_TTL_MS } = require('../src/modules/ai-core/agents/registry');
const { render } = require('../src/modules/ai-core/runtime/template');
const { parseAndValidate } = require('../src/modules/ai-core/runtime/schema');
const { createRunner } = require('../src/modules/ai-core/runtime/runner');
const { createAiCore } = require('../src/modules/ai-core');

const outputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['text'],
  properties: { text: { type: 'string' } },
};

function configuration(overrides = {}) {
  return {
    agent: {
      id: 'agent-1', key: 'demo.echo', feature: 'demo', status: 'active',
      maxConcurrency: 4,
    },
    version: {
      id: 'version-1', version: 1, status: 'published', connectionId: 'connection-1',
      model: 'fake-demo', systemPrompt: 'Return JSON.', userTemplate: 'Echo {{ text }}.',
      variables: [{ name: 'text', required: true }], outputSchema, temperature: 0,
      maxInputTokens: 1000, maxOutputTokens: 100, timeoutMs: 1000, maxRetries: 0,
      repairInvalidJson: true,
      ...overrides,
    },
  };
}

function harness(options = {}) {
  const logs = [];
  const guardOrder = [];
  const registry = options.registry || {
    async load() { return configuration(options.version); },
    async markTestOk() {},
  };
  const runner = createRunner({
    registry,
    providers: { get: () => fake },
    connectionStore: {
      async get() {
        return { id: 'connection-1', provider: 'gemini', status: 'active', baseUrl: null };
      },
    },
    priceStore: { async getPrice() { return { in: 1, cachedIn: 0.5, out: 2 }; } },
    callLog: {
      async write(entry) { logs.push(entry); return `call-${logs.length}`; },
    },
    spend: { bump() {} },
    guards: options.trackGuards ? {
      input: async state => { guardOrder.push('input'); return state; },
      cost: async state => { guardOrder.push('cost'); return state; },
      budget: async state => { guardOrder.push('budget'); return state; },
      limiter: async (_state, next) => { guardOrder.push('limiter'); return next(); },
      retry: async (_state, next) => { guardOrder.push('retry'); return next(); },
    } : undefined,
  });
  return { runner, registry, logs, guardOrder };
}

test.afterEach(() => fake.clear());

test('template replaces declared names, stringifies structured values, and reports required names', () => {
  assert.equal(render(
    '{{ text }} / {{payload}} / {{ignored}} / {{ text + 1 }}',
    { text: 'hi', payload: { ok: true }, ignored: 'extra' },
    [{ name: 'text', required: true }, { name: 'payload' }],
  ), 'hi / {"ok":true} /  / {{ text + 1 }}');
  assert.throws(
    () => render('{{a}}', {}, [{ name: 'a', required: true }, { name: 'b', required: true }]),
    error => error.code === 'VARIABLES_INVALID' && error.message.includes('a') && error.message.includes('b'),
  );
  assert.throws(() => render('{{a}}', { a: undefined }, [{ name: 'a', required: true }]), {
    code: 'VARIABLES_INVALID',
  });
});

test('schema accepts JSON fenced in Markdown and returns readable AJV errors', () => {
  assert.deepEqual(parseAndValidate('```json\n{"text":"hi"}\n```', outputSchema), {
    valid: true, data: { text: 'hi' }, errors: [],
  });
  const invalid = parseAndValidate('{"text":2}', outputSchema);
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors[0], /text.*string/);
});

test('registry selects published or draft versions, caches for 60 seconds, and updates draft test time', async () => {
  let now = 100;
  const queries = [];
  const row = {
    agent_id: 'agent-1', agent_key: 'demo.echo', agent_name: 'Echo', agent_description: '',
    agent_feature: 'demo', agent_status: 'active', max_cost_per_call_usd: '1',
    monthly_budget_usd: '10', alert_threshold_pct: 80, max_concurrency: 4,
    published_version_id: 'version-1', version_id: 'version-1', version: 1,
    version_status: 'published', connection_id: 'connection-1', model: 'fake-demo',
    system_prompt: '', user_template: '{{text}}', variables: [{ name: 'text', required: true }],
    output_schema: outputSchema, temperature: 0, max_input_tokens: 100,
    max_output_tokens: 50, timeout_ms: 1000, max_retries: 0, repair_invalid_json: true,
  };
  const database = {
    async query(sql) {
      queries.push(sql);
      if (/^\s*UPDATE/.test(sql)) return { rows: [{ last_test_ok_at: '2026-11-18T00:00:00Z' }] };
      return { rows: [{ ...row, version_status: sql.includes("v.status='draft'") ? 'draft' : 'published' }] };
    },
  };
  const registry = createRegistry(database, { now: () => now });
  assert.equal((await registry.load('demo.echo')).version.status, 'published');
  await registry.load('demo.echo');
  assert.equal(queries.length, 1);
  now += CACHE_TTL_MS + 1;
  await registry.load('demo.echo');
  assert.equal(queries.length, 2);
  assert.equal((await registry.load('demo.echo', { mode: 'test' })).version.status, 'draft');
  await registry.markTestOk('version-1');
  assert.equal(queries.some(sql => /UPDATE aic_agent_versions/.test(sql)), true);
});

test('runner succeeds through fake adapter and keeps A06 guard extension points in order', async () => {
  const { runner, logs, guardOrder } = harness({ trackGuards: true });
  fake.enqueue({ text: '{"text":"hi"}', usage: { input: 10, output: 4 } });
  const result = await runner.execute({ key: 'demo.echo', variables: { text: 'hi' }, ctx: {} });
  assert.deepEqual(result.data, { text: 'hi' });
  assert.deepEqual(result.usage, { input: 10, cachedInput: 0, output: 4, thinking: 0 });
  assert.equal(result.callId, 'call-1');
  assert.deepEqual(guardOrder, ['input', 'cost', 'budget', 'limiter', 'retry']);
  assert.equal(logs[0].status, 'success');
  assert.equal(logs[0].attempts, 1);
});

test('missing variables fail before provider invocation and are still logged', async () => {
  const { runner, logs } = harness();
  await assert.rejects(
    runner.execute({ key: 'demo.echo', variables: {} }),
    error => error.code === 'VARIABLES_INVALID' && error.callId === 'call-1',
  );
  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, 'blocked');
  assert.equal(logs[0].errorCode, 'VARIABLES_INVALID');
  assert.equal(logs[0].attempts, 0);
});

test('Markdown JSON succeeds without repair', async () => {
  const { runner, logs } = harness();
  fake.enqueue({ text: '```json\n{"text":"hi"}\n```', usage: { input: 3, output: 2 } });
  const result = await runner.execute({ key: 'demo.echo', variables: { text: 'hi' } });
  assert.deepEqual(result.data, { text: 'hi' });
  assert.equal(result.repaired, false);
  assert.equal(logs[0].schemaValidFirstTry, true);
});

test('invalid schema is repaired once and both usage records are accumulated', async () => {
  const { runner, logs } = harness();
  fake.enqueue({ text: '{"text":2}', usage: { input: 10, cachedInput: 2, output: 3 } });
  fake.enqueue({ text: '{"text":"fixed"}', usage: { input: 20, output: 5, thinking: 1 } });
  const result = await runner.execute({ key: 'demo.echo', variables: { text: 'hi' } });
  assert.deepEqual(result.data, { text: 'fixed' });
  assert.deepEqual(result.usage, { input: 30, cachedInput: 2, output: 8, thinking: 1 });
  assert.equal(result.repaired, true);
  assert.equal(logs[0].attempts, 2);
  assert.equal(logs[0].schemaValidFirstTry, false);
  assert.equal(logs[0].repaired, true);
});

test('invalid repair fails with SCHEMA_INVALID and logs both calls', async () => {
  const { runner, logs } = harness();
  fake.enqueue({ text: '{"text":2}', usage: { input: 2, output: 1 } });
  fake.enqueue({ text: '{"text":false}', usage: { input: 3, output: 1 } });
  await assert.rejects(
    runner.execute({ key: 'demo.echo', variables: { text: 'hi' } }),
    error => error.code === 'SCHEMA_INVALID' && error.callId === 'call-1',
  );
  assert.equal(logs[0].status, 'failed');
  assert.equal(logs[0].attempts, 2);
  assert.equal(logs[0].errorCode, 'SCHEMA_INVALID');
});

test('length finish fails without repair and logs OUTPUT_TRUNCATED', async () => {
  const { runner, logs } = harness();
  fake.enqueue({ text: '{"text":"partial"}', finishReason: 'length', usage: { output: 100 } });
  await assert.rejects(
    runner.execute({ key: 'demo.echo', variables: { text: 'hi' } }),
    error => error.code === 'OUTPUT_TRUNCATED' && error.callId === 'call-1',
  );
  assert.equal(logs[0].attempts, 1);
  assert.equal(logs[0].errorCode, 'OUTPUT_TRUNCATED');
  assert.equal(logs[0].repaired, false);
});

test('testRun uses the draft and updates last_test_ok_at only after success', async () => {
  let marked = null;
  let loads = 0;
  const registry = {
    async load(_key, { mode }) {
      loads += 1;
      assert.equal(mode, 'test');
      return configuration({ id: 'draft-2', version: 2, status: 'draft' });
    },
    async markTestOk(versionId) { marked = versionId; },
  };
  const { runner, logs } = harness({ registry });
  const sdk = createAiCore({ runner, registry });
  fake.enqueue({ text: '{"text":"ok"}', usage: { input: 1, output: 1 } });
  const result = await sdk.testRun('demo.echo', { text: 'ok' }, 'user-1');
  assert.equal(result.version, 2);
  assert.equal(marked, 'draft-2');
  assert.equal(loads, 1);
  assert.equal(logs[0].mode, 'test');
  assert.equal(logs[0].userId, 'user-1');
});
