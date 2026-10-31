const assert = require('node:assert/strict');
const test = require('node:test');

const tokenManager = require('../src/services/tokenManager');

function jwtWithExpiration(exp) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp })}.signature`;
}

test('uses a cached IIG token while it is outside the refresh window', async () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const token = jwtWithExpiration(Math.floor((now.getTime() + 10 * 60 * 1000) / 1000));
  let sessionCalls = 0;
  const manager = tokenManager.createTokenManager({
    now: () => now,
    database: { query: async () => ({ rows: [{ access_token: token, expired_at: new Date(now.getTime() + 20 * 60 * 1000) }] }) },
    client: { getAdminSession: async () => { sessionCalls += 1; } },
  });

  assert.equal(await manager.ensureFreshToken(), `Bearer ${token}`);
  assert.equal(sessionCalls, 0);
});

test('refreshes from the admin session API and stores the JWT exp value', async () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const expiration = new Date(now.getTime() + 30 * 60 * 1000);
  const token = jwtWithExpiration(Math.floor(expiration.getTime() / 1000));
  const writes = [];
  const manager = tokenManager.createTokenManager({
    now: () => now,
    database: {
      query: async (sql, params) => {
        if (sql.startsWith('SELECT')) return { rows: [] };
        writes.push(params);
        return { rows: [] };
      },
    },
    client: { getAdminSession: async () => ({ accessToken: token }) },
  });

  assert.equal(await manager.ensureFreshToken(), `Bearer ${token}`);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], token);
  assert.equal(writes[0][1].toISOString(), expiration.toISOString());
});

test('rejects an expired token returned with RefreshTokenError', async () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const token = jwtWithExpiration(Math.floor((now.getTime() - 60 * 1000) / 1000));
  const manager = tokenManager.createTokenManager({
    now: () => now,
    database: { query: async () => ({ rows: [] }) },
    client: { getAdminSession: async () => ({ accessToken: token, error: 'RefreshTokenError' }) },
  });

  await assert.rejects(() => manager.ensureFreshToken(), /RefreshTokenError/);
});

test('coalesces concurrent session refreshes into one request', async () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const token = jwtWithExpiration(Math.floor((now.getTime() + 30 * 60 * 1000) / 1000));
  let sessionCalls = 0;
  const manager = tokenManager.createTokenManager({
    now: () => now,
    database: {
      query: async sql => sql.startsWith('SELECT') ? { rows: [] } : { rows: [] },
    },
    client: {
      getAdminSession: async () => {
        sessionCalls += 1;
        await new Promise(resolve => setImmediate(resolve));
        return { accessToken: token };
      },
    },
  });

  const results = await Promise.all([manager.ensureFreshToken(), manager.ensureFreshToken()]);
  assert.deepEqual(results, [`Bearer ${token}`, `Bearer ${token}`]);
  assert.equal(sessionCalls, 1);
});
