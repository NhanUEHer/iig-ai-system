const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const aiCore = require('../src/modules/ai-core');
const { AiCoreError, ERROR_CODES, toHttp } = require('../src/modules/ai-core/errors');

const expectedCodes = {
  CONFIG_MISSING: [503, false],
  AGENT_PAUSED: [409, false],
  VARIABLES_INVALID: [400, false],
  INPUT_TOO_LARGE: [422, false],
  COST_CEILING: [422, false],
  QUOTA_EXCEEDED: [429, true],
  OUTPUT_TRUNCATED: [502, true],
  SCHEMA_INVALID: [502, true],
  PROVIDER_DOWN: [503, true],
  AUTH_FAILED: [502, false],
  TIMEOUT: [504, true],
};

const migrationPath = path.join(
  __dirname,
  '../src/database/migrations/153_ai_core_foundation.sql',
);
const migrationSql = fs.readFileSync(migrationPath, 'utf8');

test('AI Core error codes map to the specified HTTP status and retry behavior', () => {
  assert.deepEqual(Object.keys(ERROR_CODES).sort(), Object.keys(expectedCodes).sort());

  for (const [code, [httpStatus, retryable]] of Object.entries(expectedCodes)) {
    assert.deepEqual(ERROR_CODES[code], { httpStatus, retryable });
    const error = new AiCoreError(code, `message for ${code}`, { callId: 'call-1' });
    assert.equal(error.code, code);
    assert.equal(error.httpStatus, httpStatus);
    assert.equal(error.retryable, retryable);
    assert.equal(error.callId, 'call-1');
    assert.deepEqual(toHttp(error), {
      status: httpStatus,
      body: { error: { code, message: `message for ${code}` } },
    });
  }
});

test('toHttp converts unknown errors to a safe UNKNOWN response', () => {
  assert.deepEqual(toHttp(new Error('database password leaked')), {
    status: 500,
    body: { error: { code: 'UNKNOWN', message: 'Internal Server Error' } },
  });
});

test('foundation run placeholder reports CONFIG_MISSING', async () => {
  await assert.rejects(aiCore.run('example.agent', {}, {}), error => {
    assert.equal(error instanceof AiCoreError, true);
    assert.equal(error.code, 'CONFIG_MISSING');
    assert.equal(error.httpStatus, 503);
    assert.equal(error.retryable, false);
    return true;
  });
});

test('AI Core migration contains the complete isolated and idempotent foundation', () => {
  for (const table of [
    'aic_connections',
    'aic_models',
    'aic_agents',
    'aic_agent_versions',
    'aic_call_logs',
    'aic_usage_daily',
  ]) {
    assert.match(migrationSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i'));
  }

  assert.match(migrationSql, /WHERE status = 'draft'/i);
  assert.match(migrationSql, /WHERE status = 'published'/i);
  assert.match(migrationSql, /ON CONFLICT \(provider, model\) DO NOTHING/i);
  assert.match(migrationSql, /ai_core\.view/);
  assert.match(migrationSql, /ai_core\.manage/);
  assert.match(migrationSql, /ai_core\.run/);

  for (const model of [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'deepseek-chat',
    'deepseek-reasoner',
  ]) {
    assert.match(migrationSql, new RegExp(model.replaceAll('.', '\\.')));
  }

  assert.doesNotMatch(migrationSql, /(?:CREATE|ALTER|INSERT INTO|UPDATE)\s+ai_agents\b/i);
});

test('AI Core migration replays twice in a disposable PostgreSQL schema', {
  skip: !process.env.AI_CORE_TEST_DATABASE_URL,
}, async () => {
  const { Client } = require('pg');
  const crypto = require('node:crypto');
  const schema = `aic_test_${crypto.randomBytes(8).toString('hex')}`;
  const client = new Client({ connectionString: process.env.AI_CORE_TEST_DATABASE_URL });

  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}, public`);
    await client.query('CREATE TABLE users (id UUID PRIMARY KEY)');
    await client.query(`
      CREATE TABLE roles (
        slug TEXT PRIMARY KEY,
        permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query("INSERT INTO roles (slug) VALUES ('admin')");

    await client.query(migrationSql);
    await client.query(migrationSql);

    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name LIKE 'aic_%'`,
      [schema],
    );
    assert.equal(tables.rowCount, 6);
    const admin = await client.query("SELECT permissions FROM roles WHERE slug = 'admin'");
    assert.deepEqual(admin.rows[0].permissions, ['ai_core.manage', 'ai_core.run', 'ai_core.view']);
  } finally {
    await client.query('SET search_path TO public').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await client.end();
  }
});
