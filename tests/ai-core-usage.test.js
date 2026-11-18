const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createDailyUsage } = require('../src/modules/ai-core/usage/daily');
const { healthFromRow } = require('../src/modules/ai-core/usage/health');
const { createAlerts } = require('../src/modules/ai-core/usage/alerts');
const { createUsageJob } = require('../src/modules/ai-core/usage/job');

function percentile95(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * 0.95;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const value = sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  return Math.round(value);
}

function dailyDatabase(logs) {
  const rows = new Map();
  const sql = [];
  const database = {
    rows,
    sql,
    async transaction(work) { return work(database); },
    async query(statement, params = []) {
      sql.push(statement);
      if (/DELETE FROM aic_usage_daily/.test(statement)) {
        for (const [key, row] of rows) {
          if (row.day >= params[0] && row.day <= params[1]) rows.delete(key);
        }
        return { rows: [], rowCount: 0 };
      }
      if (/INSERT INTO aic_usage_daily/.test(statement)) {
        const groups = new Map();
        for (const log of logs.filter(item => item.day >= params[0] && item.day <= params[1])) {
          const key = `${log.day}/${log.agent_id}/${log.mode}`;
          const group = groups.get(key) || {
            day: log.day, agent_id: log.agent_id, mode: log.mode, calls: 0,
            success: 0, failed: 0, blocked: 0, truncated: 0, schema_first_try_ok: 0,
            fallback: 0, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0,
            cost_usd: 0, latencies: [],
          };
          group.calls += 1;
          group[log.status] += 1;
          group.truncated += Number(log.error_code === 'OUTPUT_TRUNCATED');
          group.schema_first_try_ok += Number(log.schema_valid_first_try === true);
          group.fallback += Number(log.used_fallback);
          group.input_tokens += log.input_tokens;
          group.cached_input_tokens += log.cached_input_tokens;
          group.output_tokens += log.output_tokens;
          group.cost_usd += log.cost_usd;
          if (log.latency_ms !== null) group.latencies.push(log.latency_ms);
          groups.set(key, group);
        }
        for (const [key, group] of groups) {
          group.cost_usd = Number(group.cost_usd.toFixed(8));
          group.latency_p95_ms = percentile95(group.latencies);
          delete group.latencies;
          rows.set(key, group);
        }
        return { rows: [...groups.values()], rowCount: groups.size };
      }
      if (/UPDATE aic_call_logs/.test(statement)) return { rows: [], rowCount: 2 };
      throw new Error(`Unexpected SQL: ${statement}`);
    },
  };
  return database;
}

test('daily rollup totals and p95 are correct and reruns replace rather than duplicate', async () => {
  const logs = [
    { day: '2026-11-18', agent_id: 'a1', mode: 'run', status: 'success', error_code: null,
      schema_valid_first_try: true, used_fallback: false, input_tokens: 10,
      cached_input_tokens: 2, output_tokens: 3, cost_usd: 0.1, latency_ms: 100 },
    { day: '2026-11-18', agent_id: 'a1', mode: 'run', status: 'failed', error_code: 'OUTPUT_TRUNCATED',
      schema_valid_first_try: false, used_fallback: true, input_tokens: 20,
      cached_input_tokens: 4, output_tokens: 6, cost_usd: 0.2, latency_ms: 200 },
    { day: '2026-11-18', agent_id: 'a1', mode: 'run', status: 'blocked', error_code: 'QUOTA_EXCEEDED',
      schema_valid_first_try: null, used_fallback: false, input_tokens: 0,
      cached_input_tokens: 0, output_tokens: 0, cost_usd: 0, latency_ms: 300 },
  ];
  const database = dailyDatabase(logs);
  const daily = createDailyUsage(database);
  await daily.rollup('2026-11-18', '2026-11-18');
  await daily.rollup('2026-11-18', '2026-11-18');
  assert.equal(database.rows.size, 1);
  assert.deepEqual([...database.rows.values()][0], {
    day: '2026-11-18', agent_id: 'a1', mode: 'run', calls: 3,
    success: 1, failed: 1, blocked: 1, truncated: 1, schema_first_try_ok: 1,
    fallback: 1, input_tokens: 30, cached_input_tokens: 6, output_tokens: 9,
    cost_usd: 0.3, latency_p95_ms: 290,
  });
  assert.match(database.sql.find(statement => /INSERT INTO aic_usage_daily/.test(statement)), /percentile_cont\(0\.95\)/);
});

function healthRow(overrides = {}) {
  return {
    agent_id: 'agent-1', agent_key: 'test.health', max_cost_per_call_usd: 1,
    monthly_budget_usd: 100, calls: 100, average_cost_usd: 0.5,
    truncated: 0, schema_evaluated: 100, schema_first_try_ok: 100,
    blocked: 0, provider_errors: 0, month_spent: 10, elapsed_days: 10,
    days_in_month: 30, ...overrides,
  };
}

test('agent health applies every specified seven-day warning threshold', () => {
  assert.deepEqual(
    { level: healthFromRow(healthRow()).level, label: healthFromRow(healthRow()).label },
    { level: 'ok', label: 'Ổn định' },
  );
  const cases = [
    [{ average_cost_usd: 0.71 }, 'Sát trần 71%'],
    [{ truncated: 3 }, '3% bị cắt token'],
    [{ schema_first_try_ok: 94 }, '94% JSON đúng lần đầu'],
    [{ blocked: 1 }, '1% bị chặn'],
    [{ month_spent: 40 }, 'Dự báo vượt ngân sách 120%'],
    [{ provider_errors: 6 }, '6% lỗi provider'],
  ];
  for (const [overrides, label] of cases) {
    const health = healthFromRow(healthRow(overrides));
    assert.equal(health.level, 'warn');
    assert.equal(health.label, label);
  }
});

test('budget alerts are inserted once per configured threshold and month', async () => {
  let spent = 85;
  let clock = new Date('2026-11-18T05:00:00.000Z');
  const inserted = new Set();
  const database = {
    async query(sql, params) {
      if (/SELECT id, monthly_budget/.test(sql)) {
        return { rows: [{ id: 'agent-1', monthly_budget_usd: 100, alert_threshold_pct: 80 }] };
      }
      if (/INSERT INTO aic_alerts/.test(sql)) {
        const key = params.join('/');
        if (inserted.has(key)) return { rows: [] };
        inserted.add(key);
        return { rows: [{ agent_id: params[0], kind: params[1], month: params[2] }] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const alerts = createAlerts(database, {
    spend: { async monthSpent() { return spent; } },
    now: () => clock,
  });
  assert.equal((await alerts.evaluateAgent('agent-1')).length, 1);
  assert.equal((await alerts.evaluateAgent('agent-1')).length, 0);
  spent = 105;
  assert.deepEqual((await alerts.evaluateAgent('agent-1')).map(alert => alert.kind), ['budget_100']);
  assert.equal((await alerts.evaluateAgent('agent-1')).length, 0);
  clock = new Date('2026-12-01T05:00:00.000Z');
  assert.deepEqual(
    (await alerts.evaluateAgent('agent-1')).map(alert => alert.kind),
    ['budget_80', 'budget_100'],
  );
});

test('hourly usage job can be disabled and otherwise uses the fake clock', async () => {
  const calls = [];
  let intervalCallback;
  const disabled = createUsageJob({
    env: { AI_CORE_JOBS: 'off' },
    setIntervalFn: () => { throw new Error('must not schedule'); },
  });
  assert.equal(disabled.start(), false);

  const job = createUsageJob({
    env: {},
    now: () => new Date('2026-11-18T05:00:00.000Z'),
    daily: {
      async rollup(from, to) { calls.push(['rollup', from, to]); },
      async cleanupPreviews() { calls.push(['cleanup']); },
    },
    alerts: { async checkAll() { calls.push(['alerts']); } },
    setIntervalFn(callback) { intervalCallback = callback; return { unref() {} }; },
    clearIntervalFn() {},
  });
  assert.equal(job.start(), true);
  await job.run();
  assert.deepEqual(calls.slice(-3), [
    ['rollup', '2026-11-17', '2026-11-18'], ['alerts'], ['cleanup'],
  ]);
  assert.equal(typeof intervalCallback, 'function');
  job.stop();
});

test('migration 154 creates the deduplicated AI Core alert table', () => {
  const sql = fs.readFileSync(path.join(
    __dirname, '../src/database/migrations/154_ai_core_alerts.sql',
  ), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS aic_alerts/);
  assert.match(sql, /UNIQUE \(agent_id, kind, month\)/);
});
