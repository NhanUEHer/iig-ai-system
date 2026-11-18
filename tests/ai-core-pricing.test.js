const assert = require('node:assert/strict');
const test = require('node:test');

const { actual, estimateMax, sumUsage } = require('../src/modules/ai-core/pricing/cost');
const { createPriceStore, CACHE_TTL_MS: PRICE_TTL } = require('../src/modules/ai-core/pricing/prices');
const { createCallLog, PREVIEW_MAX_BYTES } = require('../src/modules/ai-core/usage/callLog');
const { createSpendStore, monthWindow } = require('../src/modules/ai-core/usage/spend');

test('cost formulas apply cached input pricing and round USD to eight decimals', () => {
  const price = { in: 1, cachedIn: 0.1, out: 2 };
  assert.equal(estimateMax({ inputTokens: 100000, maxOutputTokens: 25000, price }), 0.15);
  assert.equal(actual({
    usage: { input: 100000, cachedInput: 50000, output: 25000 }, price,
  }), 0.155);
  assert.equal(actual({ usage: { input: 1 }, price: { in: 1 / 3 } }), 0.00000033);
});

test('usage from retries and JSON repair is accumulated before actual cost', () => {
  const usage = sumUsage([
    { input: 100, cachedInput: 20, output: 10, thinking: 4 },
    { input: 100, cachedInput: 20, output: 10, thinking: 3 },
    { input: 40, cachedInput: 0, output: 5, thinking: 1 },
  ]);
  assert.deepEqual(usage, { input: 240, cachedInput: 40, output: 25, thinking: 8 });
  assert.equal(actual({ usage, price: { in: 2, cachedIn: 1, out: 4 } }), 0.00062);
});

test('model prices cache for 60 seconds and saving a price invalidates its cache', async () => {
  let clock = 1000;
  let reads = 0;
  let row = {
    provider: 'gemini', model: 'flash', price_in_per_m: '1.25',
    price_cached_in_per_m: '0.25', price_out_per_m: '5', context_window: 1000,
    effective_from: new Date('2026-11-01T00:00:00Z'), status: 'active',
  };
  const db = {
    async query(sql, params) {
      if (/^SELECT/i.test(sql.trim())) reads += 1;
      if (/INSERT INTO aic_models/.test(sql)) {
        row = {
          ...row,
          provider: params[0], model: params[1], price_in_per_m: params[2],
          price_cached_in_per_m: params[3], price_out_per_m: params[4],
          context_window: params[5], status: params[6],
        };
      }
      return { rows: [row] };
    },
  };
  const prices = createPriceStore(db, { now: () => clock });
  assert.equal((await prices.getPrice('gemini', 'flash')).cachedIn, 0.25);
  await prices.getPrice('gemini', 'flash');
  assert.equal(reads, 1);
  clock += PRICE_TTL + 1;
  await prices.getPrice('gemini', 'flash');
  assert.equal(reads, 2);
  await prices.savePrice({
    provider: 'gemini', model: 'flash', in: 2, cachedIn: 0.5, out: 6,
    contextWindow: 2000, status: 'active',
  });
  assert.equal((await prices.getPrice('gemini', 'flash')).in, 2);
  assert.equal(reads, 3);
});

test('missing or disabled model prices report CONFIG_MISSING', async () => {
  for (const row of [undefined, {
    provider: 'deepseek', model: 'chat', price_in_per_m: 1,
    price_cached_in_per_m: 1, price_out_per_m: 1, context_window: 1, status: 'disabled',
  }]) {
    const prices = createPriceStore({ query: async () => ({ rows: row ? [row] : [] }) });
    await assert.rejects(prices.getPrice('deepseek', 'chat'), { code: 'CONFIG_MISSING' });
  }
});

test('call logging writes all fields, gates previews, truncates safely, and never throws', async () => {
  const calls = [];
  const logger = createCallLog({
    async query(sql, params) { calls.push({ sql, params }); return { rows: [{ id: 'log-1' }] }; },
  });
  const base = {
    agentId: 'agent', versionId: 'version-id', agentKey: 'cs.test', version: 2,
    feature: 'content-studio', status: 'success', mode: 'run', apiKey: 'must-not-be-inserted',
    requestPreview: '{"apiKey":"secret-token","authorization":"Bearer other-secret"}',
    responsePreview: 'x'.repeat(PREVIEW_MAX_BYTES + 50),
    errorMessage: 'y'.repeat(600), priceSnapshot: { in: 1, cachedIn: 0.1, out: 2 },
  };
  assert.equal(await logger.write(base), 'log-1');
  assert.equal(calls[0].params[28], null);
  assert.equal(calls[0].params[29], null);
  assert.equal(calls[0].params.some(param => param === 'must-not-be-inserted'), false);
  assert.equal(String(calls[0].params[16]).length, 500);

  await logger.write({ ...base, mode: 'test' });
  assert.equal(calls[1].params[28].includes('secret-token'), false);
  assert.equal(calls[1].params[28].includes('other-secret'), false);
  assert.equal(Buffer.byteLength(calls[1].params[29]) <= PREVIEW_MAX_BYTES, true);

  let errorLogs = 0;
  const failing = createCallLog({ query: async () => { throw new Error('secret DB URL'); } }, {
    logError: () => { errorLogs += 1; },
  });
  assert.equal(await failing.write(base), null);
  assert.equal(errorLogs, 1);

  const circular = {};
  circular.self = circular;
  assert.equal(await failing.write({ ...base, priceSnapshot: circular }), null);
  assert.equal(errorLogs, 2);
});

test('month spend uses Vietnam month/day boundaries, caches, and bumps immediately', async () => {
  let clock = new Date('2026-11-30T16:59:00.000Z'); // 23:59 on Nov 30 in Vietnam
  const queries = [];
  const db = {
    async query(_sql, params) { queries.push(params); return { rows: [{ spent: '12.25' }] }; },
  };
  const spend = createSpendStore(db, { now: () => clock });
  assert.equal(await spend.monthSpent('agent-1'), 12.25);
  assert.deepEqual(queries[0].slice(1, 3), ['2026-11-01', '2026-11-30']);
  assert.equal(queries[0][3].toISOString(), '2026-11-29T17:00:00.000Z');
  spend.bump('agent-1', 0.5);
  assert.equal(await spend.monthSpent('agent-1'), 12.75);
  assert.equal(queries.length, 1);

  clock = new Date('2026-11-30T17:01:00.000Z'); // 00:01 on Dec 1 in Vietnam
  assert.equal(await spend.monthSpent('agent-1'), 12.25);
  assert.deepEqual(queries[1].slice(1, 3), ['2026-12-01', '2026-12-01']);
  assert.equal(monthWindow(clock).start.toISOString(), '2026-11-30T17:00:00.000Z');
});
