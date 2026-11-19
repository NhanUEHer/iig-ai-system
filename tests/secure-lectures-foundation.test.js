const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  SecureLectureError,
  ERROR_CODES,
  toHttp,
} = require('../src/modules/secure-lectures/errors');
const { DEFAULTS, loadConfig } = require('../src/modules/secure-lectures/config');
const {
  createMemorySessionStore,
  createMemoryTicketStore,
  createMemoryRateLimitStore,
} = require('../src/modules/secure-lectures/stores');
const secureLectureRoutes = require('../src/routes/secureLectureRoutes');

const expectedStatuses = {
  LINK_INVALID: 404,
  LINK_REVOKED: 410,
  LINK_EXPIRED: 410,
  LINK_NOT_STARTED: 403,
  DEVICE_LIMIT: 403,
  DEVICE_BLOCKED: 403,
  DEVICE_REMOVED: 403,
  CONCURRENT_LIMIT: 409,
  SESSION_KICKED: 409,
  SESSION_GONE: 404,
  RATE_LIMITED: 429,
  LECTURE_NOT_READY: 409,
  FILE_INVALID: 400,
  FILE_TOO_LARGE: 413,
  FOLDER_CYCLE: 409,
  FOLDER_TOO_DEEP: 409,
  NAME_TAKEN: 409,
};

test('Secure Lecture error codes map to the HTTP statuses in the specification', () => {
  assert.deepEqual(Object.keys(ERROR_CODES).sort(), Object.keys(expectedStatuses).sort());
  for (const [code, status] of Object.entries(expectedStatuses)) {
    assert.deepEqual(ERROR_CODES[code], { httpStatus: status });
    assert.deepEqual(toHttp(new SecureLectureError(code, `message for ${code}`)), {
      status,
      body: {
        success: false,
        error: { code, message: `message for ${code}` },
      },
    });
  }
});

test('toHttp safely hides the message from an unknown error', () => {
  assert.deepEqual(toHttp(new Error('database password leaked')), {
    status: 500,
    body: {
      success: false,
      error: { code: 'UNKNOWN', message: 'Internal Server Error' },
    },
  });
});

test('Secure Lecture config loads the architecture defaults', () => {
  assert.deepEqual(loadConfig({}), DEFAULTS);
  assert.deepEqual(loadConfig({
    SECURE_LECTURES_PUBLIC_BASE_URL: 'https://admin.example',
    SECURE_LECTURES_STORAGE_PREFIX: 'private-lectures',
    SECURE_LECTURES_MAX_UPLOAD_MB: '12',
    SECURE_LECTURES_HEARTBEAT_SEC: '15',
    SECURE_LECTURES_SESSION_TTL_SEC: '45',
    SECURE_LECTURES_TICKET_TTL_SEC: '25',
    SECURE_LECTURES_LOG_RETENTION_DAYS: '90',
  }), {
    publicBaseUrl: 'https://admin.example',
    storagePrefix: 'private-lectures',
    maxUploadMb: 12,
    heartbeatSec: 15,
    sessionTtlSec: 45,
    ticketTtlSec: 25,
    logRetentionDays: 90,
  });
});

test('memory stores provide expiring sessions, one-time tickets, and fixed-window limits', async () => {
  let now = 1_000;
  const clock = () => now;
  const sessions = createMemorySessionStore({ now: clock });
  await sessions.put('s1', { id: 's1', shareId: 'share-1' }, 10);
  assert.equal((await sessions.get('s1')).id, 's1');
  now = 11_001;
  assert.equal(await sessions.get('s1'), null);

  const tickets = createMemoryTicketStore({ now: clock });
  await tickets.put('ticket-1', { sessionId: 's1' }, 10);
  assert.deepEqual(await tickets.consume('ticket-1'), { sessionId: 's1' });
  assert.equal(await tickets.consume('ticket-1'), null);

  const limits = createMemoryRateLimitStore({ now: clock });
  assert.equal((await limits.consume('ip:1', 1, 60)).allowed, true);
  assert.equal((await limits.consume('ip:1', 1, 60)).allowed, false);
});

test('admin health route returns 200 with secure_lectures.view and 403 without it', () => {
  const healthRoute = secureLectureRoutes.stack.find(layer => layer.route?.path === '/health').route;
  const permissionMiddleware = healthRoute.stack[0].handle;
  const healthHandler = healthRoute.stack[1].handle;

  let allowedError;
  permissionMiddleware(
    { auth: { permissions: ['secure_lectures.view'] } },
    {},
    error => { allowedError = error; },
  );
  assert.equal(allowedError, undefined);

  let status = 200;
  let body;
  healthHandler({}, {
    status(code) {
      status = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  });
  assert.equal(status, 200);
  assert.deepEqual(body, { ok: true });

  let deniedError;
  permissionMiddleware(
    { auth: { permissions: [] } },
    {},
    error => { deniedError = error; },
  );
  assert.equal(deniedError.statusCode, 403);
  assert.equal(deniedError.code, 'PERMISSION_DENIED');
});

const migrationPath = path.join(
  __dirname,
  '../src/database/migrations/160_secure_lectures.sql',
);
const migrationSql = fs.readFileSync(migrationPath, 'utf8');

test('Secure Lecture migration defines seven isolated tables and admin permissions', () => {
  for (const table of [
    'sl_folders',
    'sl_lectures',
    'sl_lecture_versions',
    'sl_shares',
    'sl_devices',
    'sl_sessions',
    'sl_access_logs',
  ]) {
    assert.match(migrationSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, 'i'));
  }
  assert.match(migrationSql, /secure_lectures\.view/);
  assert.match(migrationSql, /secure_lectures\.manage/);
  assert.match(migrationSql, /secure_lectures\.share/);
  assert.doesNotMatch(migrationSql, /(?:CREATE|ALTER|INSERT INTO|UPDATE)\s+cs_/i);
});

const testDatabaseUrl = process.env.SECURE_LECTURES_TEST_DATABASE_URL;
test('Secure Lecture migration replays twice in a disposable PostgreSQL schema', {
  skip: !testDatabaseUrl,
}, async () => {
  const { Client } = require('pg');
  const crypto = require('node:crypto');
  const schema = `sl_test_${crypto.randomBytes(8).toString('hex')}`;
  const client = new Client({ connectionString: testDatabaseUrl });

  await client.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
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
      "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name LIKE 'sl_%'",
      [schema],
    );
    assert.equal(tables.rowCount, 7);
    const admin = await client.query("SELECT permissions FROM roles WHERE slug = 'admin'");
    assert.deepEqual(admin.rows[0].permissions, [
      'secure_lectures.manage',
      'secure_lectures.share',
      'secure_lectures.view',
    ]);
  } finally {
    await client.query('SET search_path TO public').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await client.end();
  }
});
