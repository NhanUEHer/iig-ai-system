const assert = require('node:assert/strict');
const test = require('node:test');

const fake = require('../src/modules/ai-core/providers/adapters/fake');
const { createLimiter } = require('../src/modules/ai-core/guards/limiter');
const { createRetry } = require('../src/modules/ai-core/guards/retry');
const { createRunner } = require('../src/modules/ai-core/runtime/runner');

const outputSchema = {
  type: 'object',
  required: ['ok'],
  properties: { ok: { type: 'boolean' } },
};

function config(overrides = {}) {
  return {
    agent: {
      id: 'agent-1', key: 'test.guard', feature: 'test', status: 'active',
      maxCostPerCallUsd: 1, monthlyBudgetUsd: 10, maxConcurrency: 2,
      ...(overrides.agent || {}),
    },
    version: {
      id: 'version-1', version: 1, connectionId: 'primary', model: 'primary-model',
      fallbackConnectionId: null, fallbackModel: null,
      systemPrompt: 'Return JSON.', userTemplate: '{{text}}',
      variables: [{ name: 'text', required: true }], outputSchema,
      temperature: 0, maxInputTokens: 100, maxOutputTokens: 100,
      timeoutMs: 1000, maxRetries: 0, repairInvalidJson: false,
      ...(overrides.version || {}),
    },
  };
}

function harness(overrides = {}) {
  const logs = [];
  const delays = [];
  const connections = {
    primary: { id: 'primary', provider: 'gemini', status: 'active' },
    fallback: { id: 'fallback', provider: 'deepseek', status: 'active' },
  };
  const prices = {
    'gemini/primary-model': { in: 1, cachedIn: 0.5, out: 2 },
    'deepseek/fallback-model': { in: 2, cachedIn: 1, out: 4 },
    ...(overrides.prices || {}),
  };
  let now = 1000;
  const retry = createRetry({
    sleep: async ms => { delays.push(ms); now += ms; },
    random: () => 0.5,
    now: () => now,
  });
  const runner = createRunner({
    now: () => now,
    registry: { async load() { return config(overrides); } },
    providers: { get: () => fake },
    connectionStore: { async get(id) { return connections[id]; } },
    priceStore: { async getPrice(provider, model) { return prices[`${provider}/${model}`]; } },
    spend: {
      async monthSpent() { return overrides.monthSpent || 0; },
      bump() {},
    },
    callLog: { async write(entry) { logs.push(entry); return `call-${logs.length}`; } },
    guards: { retry },
  });
  return { runner, logs, delays };
}

test.afterEach(() => fake.clear());

test('input, cost, and monthly-budget guards block and log without cost', async t => {
  await t.test('input token limit', async () => {
    const { runner, logs } = harness({ version: { maxInputTokens: 1 } });
    await assert.rejects(runner.execute({ key: 'test.guard', variables: { text: 'too long' } }), {
      code: 'INPUT_TOO_LARGE',
    });
    assert.match(logs[0].errorMessage, /tokens; the limit is 1/);
    assert.deepEqual([logs[0].status, logs[0].attempts, logs[0].costUsd], ['blocked', 0, 0]);
  });

  await t.test('per-call cost ceiling', async () => {
    const { runner, logs } = harness({ agent: { maxCostPerCallUsd: 0 } });
    await assert.rejects(runner.execute({ key: 'test.guard', variables: { text: 'x' } }), {
      code: 'COST_CEILING',
    });
    assert.deepEqual([logs[0].status, logs[0].errorCode, logs[0].attempts], [
      'blocked', 'COST_CEILING', 0,
    ]);
  });

  await t.test('monthly budget', async () => {
    const { runner, logs } = harness({ agent: { monthlyBudgetUsd: 1 }, monthSpent: 1 });
    await assert.rejects(runner.execute({ key: 'test.guard', variables: { text: 'x' } }), {
      code: 'QUOTA_EXCEEDED',
    });
    assert.equal(logs[0].status, 'blocked');
  });
});

test('test mode bypasses monthly budget', async () => {
  const { runner, logs } = harness({ agent: { monthlyBudgetUsd: 0 }, monthSpent: 100 });
  fake.enqueue({ text: '{"ok":true}', usage: { input: 1, output: 1 } });
  const result = await runner.execute({
    key: 'test.guard', variables: { text: 'x' }, mode: 'test',
  });
  assert.equal(result.data.ok, true);
  assert.equal(logs[0].status, 'success');
});

test('retry uses fake-clock backoff and succeeds on the third attempt', async () => {
  const { runner, logs, delays } = harness({ version: { maxRetries: 2 } });
  fake.enqueue({ error: { retryable: true } });
  fake.enqueue({ error: { retryable: true } });
  fake.enqueue({ text: '{"ok":true}', usage: { input: 10, output: 5 } });
  const result = await runner.execute({ key: 'test.guard', variables: { text: 'x' } });
  assert.deepEqual(delays, [1000, 2000]);
  assert.equal(result.costUsd, 0.00002);
  assert.deepEqual([logs[0].attempts, logs[0].status, logs[0].usedFallback], [3, 'success', false]);
});

test('retry respects Retry-After and caps it at ten seconds', async () => {
  const delays = [];
  const retry = createRetry({ sleep: async ms => delays.push(ms), random: () => 0.5 });
  let attempts = 0;
  const result = await retry({ version: { maxRetries: 1 } }, async () => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error('busy'), { retryable: true, retryAfter: '20' });
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.deepEqual(delays, [10000]);
});

test('exhausted primary retries switch to fallback and log the actual model', async () => {
  const { runner, logs } = harness({
    version: {
      maxRetries: 1, fallbackConnectionId: 'fallback', fallbackModel: 'fallback-model',
    },
  });
  fake.enqueue({ error: { retryable: true } });
  fake.enqueue({ error: { retryable: true } });
  fake.enqueue({ text: '{"ok":true}', usage: { input: 5, output: 5 } });
  const result = await runner.execute({ key: 'test.guard', variables: { text: 'x' } });
  assert.equal(result.usedFallback, true);
  assert.equal(result.model, 'fallback-model');
  assert.deepEqual([logs[0].attempts, logs[0].usedFallback, logs[0].model], [
    3, true, 'fallback-model',
  ]);
});

test('fallback is guarded against its own price before provider invocation', async () => {
  const { runner, logs } = harness({
    agent: { maxCostPerCallUsd: 0.0005 },
    version: { fallbackConnectionId: 'fallback', fallbackModel: 'fallback-model' },
    prices: { 'deepseek/fallback-model': { in: 100, cachedIn: 100, out: 100 } },
  });
  fake.enqueue({ error: { retryable: true } });
  await assert.rejects(runner.execute({ key: 'test.guard', variables: { text: 'x' } }), {
    code: 'COST_CEILING',
  });
  assert.deepEqual([
    logs[0].status, logs[0].errorCode, logs[0].attempts, logs[0].usedFallback, logs[0].costUsd,
  ], ['blocked', 'COST_CEILING', 1, true, 0]);
});

test('limiter enforces the configured agent concurrency', async () => {
  const limiter = createLimiter({ env: { AI_CORE_PROVIDER_CONCURRENCY: '8' } });
  const state = {
    key: 'test.guard', agent: { id: 'agent-1', maxConcurrency: 2 },
    connection: { id: 'connection-1' },
  };
  let active = 0;
  let peak = 0;
  const releases = [];
  const work = () => limiter(state, async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => releases.push(resolve));
    active -= 1;
  });
  const tasks = [work(), work(), work(), work()];
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(peak, 2);
  releases.splice(0).forEach(resolve => resolve());
  await new Promise(resolve => setImmediate(resolve));
  releases.splice(0).forEach(resolve => resolve());
  await Promise.all(tasks);
  assert.equal(peak, 2);
});
