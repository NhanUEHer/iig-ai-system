const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { sameOriginOnly } = require('../src/http/sameOriginOnly');
const { SecureLectureError } = require('../src/modules/secure-lectures/errors');
const { createAccessEngine } = require('../src/modules/secure-lectures/services/accessEngine');
const tokenService = require('../src/modules/secure-lectures/services/tokenService');
const { createMemorySessionStore } = require('../src/modules/secure-lectures/stores/sessionStore');
const { createMemoryTicketStore } = require('../src/modules/secure-lectures/stores/ticketStore');
const { createMemoryRateLimitStore } = require('../src/modules/secure-lectures/stores/rateLimitStore');
const publicRoutes = require('../src/routes/secureLecturePublicRoutes');

const SHARE_ID = '10000000-0000-4000-8000-000000000001';
const LECTURE_ID = '10000000-0000-4000-8000-000000000002';
const VERSION_ID = '10000000-0000-4000-8000-000000000003';
const START = Date.parse('2026-11-19T08:00:00.000Z');

function code(expected) {
  return error => error instanceof SecureLectureError && error.code === expected;
}

function memoryRepository(share) {
  const state = { share, devices: [], sessions: [], logs: [] };
  let tail = Promise.resolve();
  const transaction = work => {
    const run = tail.then(() => work({ memory: true }));
    tail = run.catch(() => {});
    return run;
  };
  return {
    state,
    transaction,
    async lockShareByToken(_client, hash) { return hash === share.token_hash ? share : null; },
    async findDevice(_client, shareId, deviceId) {
      return state.devices.find(item => item.share_id === shareId && item.device_id === deviceId) || null;
    },
    async activeDeviceCount() { return state.devices.filter(item => !item.removed_at).length; },
    async registerDevice(_client, input) {
      let row = state.devices.find(item => item.id === input.existingId);
      if (!row) {
        row = { id: crypto.randomUUID(), share_id: input.shareId, device_id: input.deviceId };
        state.devices.push(row);
      }
      Object.assign(row, {
        fingerprint: input.fingerprint, label: input.label, user_agent: input.userAgent,
        last_ip: input.ip, last_seen_at: input.now, removed_at: null,
      });
      return row;
    },
    async touchDevice(_client, id, input) {
      const row = state.devices.find(item => item.id === id);
      Object.assign(row, {
        fingerprint: input.fingerprint, label: input.label, user_agent: input.userAgent,
        last_ip: input.ip, last_seen_at: input.now,
      });
      return row;
    },
    async insertSession(_client, session) {
      state.sessions.push({
        id: session.id, share_id: session.shareId, device_ref: session.deviceRef,
        version_id: session.versionId, started_at: session.startedAt,
        last_heartbeat_at: session.lastHeartbeatAt, ended_at: null, end_reason: null,
      });
    },
    async reserveSession(client, session, maxConcurrent, now, ttlSec) {
      const cutoff = now.getTime() - ttlSec * 1000;
      for (const row of state.sessions) {
        if (!row.ended_at && new Date(row.last_heartbeat_at).getTime() < cutoff) {
          row.ended_at = now; row.end_reason = 'timeout';
        }
        if (!row.ended_at && row.share_id === session.shareId
          && row.device_ref === session.deviceRef) {
          row.ended_at = now; row.end_reason = 'closed';
        }
      }
      const live = state.sessions.filter(row => row.share_id === session.shareId && !row.ended_at);
      if (live.length >= maxConcurrent) {
        return {
          acquired: false,
          liveSessions: live.map(row => ({
            id: row.id,
            deviceLabel: state.devices.find(item => item.id === row.device_ref)?.label,
            startedAt: row.started_at,
          })),
        };
      }
      await this.insertSession(client, session);
      return { acquired: true };
    },
    async endSessions(_client, ids, reason) {
      for (const row of state.sessions) {
        if (ids.includes(row.id) && !row.ended_at) {
          row.ended_at = new Date(); row.end_reason = reason;
        }
      }
    },
    async sessionContext(id) {
      const row = state.sessions.find(item => item.id === id);
      if (!row) return null;
      const device = state.devices.find(item => item.id === row.device_ref);
      return {
        ...row,
        lecture_id: share.lecture_id,
        lecture_archived_at: share.archived_at,
        revoked_at: share.revoked_at,
        expires_at: share.expires_at,
        device_id: device.device_id,
        removed_at: device.removed_at,
        blocked_at: device.blocked_at,
      };
    },
    async touchDurableSession(id, now) {
      const row = state.sessions.find(item => item.id === id);
      if (row) row.last_heartbeat_at = now;
      return Boolean(row);
    },
    async endSession(id, reason, kickedBy = null) {
      const row = state.sessions.find(item => item.id === id);
      if (!row || row.ended_at) return null;
      row.ended_at = new Date();
      row.end_reason = reason;
      row.kicked_by_session_id = kickedBy;
      return row;
    },
    async log(_client, entry) { state.logs.push(entry); },
  };
}

function fixture(overrides = {}) {
  let clock = START;
  const token = tokenService.generate();
  const share = {
    id: SHARE_ID,
    lecture_id: LECTURE_ID,
    token_hash: tokenService.hash(token),
    lecture_title: 'Lecture',
    archived_at: null,
    version_id: VERSION_ID,
    recipient_name: 'Teacher',
    valid_from: new Date(START - 1000),
    expires_at: new Date(START + 3600_000),
    revoked_at: null,
    max_devices: 3,
    max_concurrent: 1,
    ...overrides,
  };
  const repository = memoryRepository(share);
  const sessions = createMemorySessionStore({ now: () => clock });
  const tickets = createMemoryTicketStore({ now: () => clock });
  const engine = createAccessEngine({
    repository, sessions, tickets, now: () => new Date(clock),
    sessionTtlSec: 90, ticketTtlSec: 60, heartbeatSec: 30,
  });
  return {
    token, share, repository, sessions, tickets, engine,
    advance(ms) { clock += ms; },
  };
}

const ctx = {
  ip: '127.0.0.1',
  userAgent: 'Mozilla/5.0 (Macintosh) Chrome/131.0.0.0',
  client: { tz: 'Asia/Ho_Chi_Minh', screen: '1440x900', platform: 'MacIntel' },
};
const did = number => `20000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

test('access validation returns the specified link errors and audits every denial', async () => {
  const invalid = fixture();
  await assert.rejects(invalid.engine.open('bad', did(1), ctx), code('LINK_INVALID'));
  assert.equal(invalid.repository.state.logs.at(-1).reason, 'LINK_INVALID');

  for (const [overrides, expected] of [
    [{ revoked_at: new Date(START - 1) }, 'LINK_REVOKED'],
    [{ valid_from: new Date(START + 1000) }, 'LINK_NOT_STARTED'],
    [{ expires_at: new Date(START - 1) }, 'LINK_EXPIRED'],
  ]) {
    const item = fixture(overrides);
    await assert.rejects(item.engine.open(item.token, did(1), ctx), code(expected));
    assert.equal(item.repository.state.logs.at(-1).reason, expected);
  }
});

test('device limit is atomic and a removed slot can be registered again', async () => {
  const f = fixture();
  for (let index = 1; index <= 3; index += 1) {
    await f.engine.open(f.token, did(index), ctx);
    await f.engine.end(f.repository.state.sessions.at(-1).id);
  }
  await assert.rejects(f.engine.open(f.token, did(4), ctx), code('DEVICE_LIMIT'));
  f.repository.state.devices[0].removed_at = new Date();
  const opened = await f.engine.open(f.token, did(4), ctx);
  assert.ok(opened.sessionId);
});

test('concurrency, takeover, same-device replacement and kicked heartbeat follow the contract', async () => {
  const f = fixture();
  const first = await f.engine.open(f.token, did(1), ctx);
  await assert.rejects(f.engine.open(f.token, did(2), ctx), error => {
    assert.equal(error.code, 'CONCURRENT_LIMIT');
    assert.equal(error.data.liveSessions[0].sessionId, first.sessionId);
    return true;
  });
  const replacement = await f.engine.open(f.token, did(1), ctx);
  assert.notEqual(replacement.sessionId, first.sessionId);
  await f.engine.end(replacement.sessionId);
  assert.equal(f.repository.state.logs.at(-1).event, 'end');

  const target = await f.engine.open(f.token, did(1), ctx);
  const taken = await f.engine.takeover(f.token, did(2), target.sessionId, ctx);
  assert.ok(taken.sessionId);
  await assert.rejects(f.engine.heartbeat(target.sessionId), code('SESSION_KICKED'));
});

test('ten simultaneous opens with maxConcurrent=1 produce exactly one session', async () => {
  const f = fixture({ max_devices: 20 });
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, (_, index) => f.engine.open(f.token, did(index + 1), ctx)),
  );
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(results.filter(item => item.reason?.code === 'CONCURRENT_LIMIT').length, 9);
});

test('durable PostgreSQL state prevents over-allocation after an empty session cache', async () => {
  const f = fixture();
  const existingDevice = await f.repository.registerDevice({}, {
    shareId: SHARE_ID, deviceId: did(1), label: 'Existing', now: new Date(START),
  });
  f.repository.state.sessions.push({
    id: crypto.randomUUID(), share_id: SHARE_ID, device_ref: existingDevice.id,
    version_id: VERSION_ID, started_at: new Date(START), last_heartbeat_at: new Date(START),
    ended_at: null, end_reason: null,
  });
  await assert.rejects(f.engine.open(f.token, did(2), ctx), code('CONCURRENT_LIMIT'));
});

test('stale sessions free their slot and revoke is rechecked by heartbeat', async () => {
  const f = fixture();
  const first = await f.engine.open(f.token, did(1), ctx);
  f.advance(90_001);
  await assert.rejects(f.engine.heartbeat(first.sessionId), code('SESSION_GONE'));
  assert.ok((await f.engine.open(f.token, did(2), ctx)).sessionId);

  const active = f.repository.state.sessions.at(-1).id;
  f.share.revoked_at = new Date();
  await assert.rejects(f.engine.heartbeat(active), code('LINK_REVOKED'));
});

test('heartbeat preserves removed and blocked device reasons after admin ends the session', async () => {
  for (const [field, expected] of [['removed_at', 'DEVICE_REMOVED'], ['blocked_at', 'DEVICE_BLOCKED']]) {
    const f = fixture();
    const opened = await f.engine.open(f.token, did(1), ctx);
    const deviceRow = f.repository.state.devices[0];
    deviceRow[field] = new Date();
    await f.repository.endSession(opened.sessionId, 'device_removed');
    await f.sessions.end(opened.sessionId, 'device_removed');
    await assert.rejects(f.engine.heartbeat(opened.sessionId), code(expected));
  }
});

test('archiving a lecture invalidates an already-open session on its next heartbeat', async () => {
  const f = fixture();
  const opened = await f.engine.open(f.token, did(1), ctx);
  f.share.archived_at = new Date();
  await assert.rejects(f.engine.heartbeat(opened.sessionId), code('LINK_INVALID'));
});

test('public route rate-limits the eleventh open request', async () => {
  const router = publicRoutes.createSecureLecturePublicRoutes({
    limits: createMemoryRateLimitStore(),
    engine: { async open() { return { sessionId: crypto.randomUUID() }; } },
  });
  const handler = router.stack.find(layer => layer.route?.path === '/session').route.stack[0].handle;
  let error;
  for (let index = 0; index < 11; index += 1) {
    const headers = {};
    const req = {
      ip: '127.0.0.1', body: { token: tokenService.generate() }, secure: false,
      protocol: 'http', get: name => headers[name.toLowerCase()] || null,
    };
    const res = {
      set(name, value) { headers[name.toLowerCase()] = value; return this; },
      cookie() {}, status() { return this; }, json() { return this; },
    };
    error = undefined;
    await handler(req, res, caught => { error = caught; });
  }
  assert.equal(error.code, 'RATE_LIMITED');
  assert.equal(error.httpStatus, 429);
});

test('device cookie is a long-lived httpOnly same-origin UUID and is reused', () => {
  let written;
  const req = {
    secure: false,
    get(name) { return name.toLowerCase() === 'x-forwarded-proto' ? 'https' : null; },
  };
  const id = publicRoutes.device(req, {
    cookie(name, value, options) { written = { name, value, options }; },
  });
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(written.name, 'sl_did');
  assert.equal(written.options.httpOnly, true);
  assert.equal(written.options.secure, true);
  assert.equal(written.options.sameSite, 'lax');
  assert.equal(written.options.path, '/api/public/lectures');
  assert.equal(written.options.maxAge, 400 * 24 * 60 * 60 * 1000);

  const reused = publicRoutes.device({
    secure: true,
    get(name) { return name.toLowerCase() === 'cookie' ? `sl_did=${id}` : null; },
  }, { cookie() { throw new Error('cookie should not be replaced'); } });
  assert.equal(reused, id);
});

test('public lecture API rejects cross-origin requests before global cors()', () => {
  let error;
  sameOriginOnly({
    protocol: 'https',
    get(name) {
      return { origin: 'https://evil.example', host: 'admin.example' }[name.toLowerCase()] || null;
    },
  }, {}, caught => { error = caught; });
  assert.equal(error.statusCode, 403);
  assert.equal(error.code, 'CORS_FORBIDDEN');

  for (const file of ['src/app.js', 'src/apps/shared/createHttpApp.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.ok(source.indexOf("app.use('/api/public/lectures', sameOriginOnly)") < source.indexOf('app.use(cors())'));
  }
});

test('PostgreSQL fallback store serializes acquire when a disposable database is provided', {
  skip: !process.env.SECURE_LECTURES_TEST_DATABASE_URL,
}, async () => {
  const { Pool } = require('pg');
  const { createDbSessionStore } = require('../src/modules/secure-lectures/stores/sessionStore.db');
  const schema = `sl_access_${crypto.randomBytes(8).toString('hex')}`;
  const pool = new Pool({ connectionString: process.env.SECURE_LECTURES_TEST_DATABASE_URL });
  const searchPath = `SET search_path TO ${schema}, public`;
  const database = {
    async query(sql, params) {
      const client = await pool.connect();
      try { await client.query(searchPath); return await client.query(sql, params); }
      finally { client.release(); }
    },
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(searchPath);
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    },
  };
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await pool.query(`CREATE SCHEMA ${schema}`);
    await database.query('CREATE TABLE users (id UUID PRIMARY KEY, name TEXT, username TEXT)');
    await database.query(`CREATE TABLE roles (
      slug TEXT PRIMARY KEY, permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await database.query("INSERT INTO roles (slug) VALUES ('admin')");
    const migration = fs.readFileSync(
      path.join(__dirname, '../src/database/migrations/160_secure_lectures.sql'), 'utf8',
    );
    await database.query(migration);
    await database.query(`INSERT INTO sl_lectures (id, title) VALUES ($1, 'Race')`, [LECTURE_ID]);
    await database.query(`INSERT INTO sl_lecture_versions
      (id, lecture_id, version_no, storage_key, original_filename, size_bytes, sha256)
      VALUES ($1,$2,1,'secure-lectures/test.html','test.html',1,$3)`,
    [VERSION_ID, LECTURE_ID, 'a'.repeat(64)]);
    await database.query('UPDATE sl_lectures SET current_version_id = $2 WHERE id = $1',
      [LECTURE_ID, VERSION_ID]);
    await database.query(`INSERT INTO sl_shares
      (id, lecture_id, token_hash, token_hint, recipient_name, expires_at,
       max_devices, max_concurrent)
      VALUES ($1,$2,$3,'hint','Teacher',CURRENT_TIMESTAMP + INTERVAL '1 day',10,1)`,
    [SHARE_ID, LECTURE_ID, 'b'.repeat(64)]);
    const deviceRefs = [];
    for (let index = 1; index <= 10; index += 1) {
      const result = await database.query(`INSERT INTO sl_devices
        (share_id, device_id, label) VALUES ($1,$2,$3) RETURNING id`,
      [SHARE_ID, did(index), `Device ${index}`]);
      deviceRefs.push(result.rows[0].id);
    }
    const store = createDbSessionStore({ database });
    const results = await Promise.all(deviceRefs.map((deviceRef, index) => store.acquire({
      id: crypto.randomUUID(), shareId: SHARE_ID, deviceRef, deviceId: did(index + 1),
      versionId: VERSION_ID, startedAt: new Date().toISOString(), deviceLabel: `Device ${index + 1}`,
    }, 1, Date.now(), 90)));
    assert.equal(results.filter(result => result.acquired).length, 1);
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await pool.end();
  }
});
