const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { authenticateAiScoringService, parsePermissions } = require('../src/middleware/authenticateAiScoringService');
const { createAiScoringAdminClient } = require('../src/clients/aiScoringAdminClient');
const { forwardedHeaders, parseTenantScope, createAiScoringAdminProxyRoutes } = require('../src/routes/aiScoringAdminProxyRoutes');

function middlewareResult(headers, token) {
  const previous = process.env.AI_SCORING_ADMIN_SERVICE_TOKEN;
  process.env.AI_SCORING_ADMIN_SERVICE_TOKEN = token;
  const req = { get: name => headers[name.toLowerCase()] };
  let receivedError;
  authenticateAiScoringService(req, {}, error => { receivedError = error; });
  if (previous === undefined) delete process.env.AI_SCORING_ADMIN_SERVICE_TOKEN;
  else process.env.AI_SCORING_ADMIN_SERVICE_TOKEN = previous;
  return { req, error: receivedError };
}

test('machine authentication accepts the shared service token and constrained permissions', () => {
  const { req, error } = middlewareResult({
    authorization: 'Bearer service-secret',
    'x-admin-actor-id': 'user-1',
    'x-admin-actor-email': 'admin@example.com',
    'x-admin-permissions': 'ai_scoring.jobs.view,users.delete,ai_scoring.operations.retry',
  }, 'service-secret');
  assert.equal(error, undefined);
  assert.equal(req.auth.service, 'iig-admin-bff');
  assert.deepEqual(req.auth.permissions, ['ai_scoring.jobs.view', 'ai_scoring.operations.retry']);
  assert.equal(req.user.email, 'admin@example.com');
});

test('machine authentication rejects invalid credentials without database session lookup', () => {
  const { error } = middlewareResult({ authorization: 'Bearer wrong' }, 'service-secret');
  assert.equal(error.statusCode, 401);
  assert.equal(error.code, 'AI_SCORING_SERVICE_AUTH_FAILED');
  assert.deepEqual(parsePermissions('users.delete, reports.view'), []);
});

test('BFF client retries safe reads once but never retries mutations', async () => {
  const calls = [];
  const http = { request: async config => {
    calls.push(config);
    if (calls.length === 1) return { status: 503, data: { code: 'BUSY' }, headers: {} };
    return { status: 200, data: { success: true }, headers: {} };
  } };
  const client = createAiScoringAdminClient({ http, baseUrl: 'http://scoring', serviceToken: 'secret' });
  const response = await client.request({ method: 'GET', path: '/jobs', query: { page: 1 } });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'http://scoring/api/admin/v1/jobs');

  calls.length = 0;
  const mutation = await client.request({ method: 'POST', path: '/jobs/1/retry', body: {} });
  assert.equal(mutation.status, 503);
  assert.equal(calls.length, 1);
});

test('BFF client opens its circuit after repeated transport failures', async () => {
  const http = { request: async () => { throw Object.assign(new Error('down'), { code: 'ECONNREFUSED' }); } };
  const client = createAiScoringAdminClient({
    http,
    baseUrl: 'http://scoring',
    serviceToken: 'secret',
    circuitFailureThreshold: 2,
    circuitResetMs: 60000,
  });
  await assert.rejects(() => client.request({ method: 'POST', path: '/jobs/1/retry' }), error => error.code === 'AI_SCORING_ADMIN_UNAVAILABLE');
  await assert.rejects(() => client.request({ method: 'POST', path: '/jobs/1/retry' }), error => error.code === 'AI_SCORING_ADMIN_UNAVAILABLE');
  await assert.rejects(() => client.request({ method: 'GET', path: '/jobs' }), error => error.code === 'AI_SCORING_ADMIN_CIRCUIT_OPEN');
});

test('BFF forwards request identity, actor, scoped permissions and idempotency key', () => {
  const req = {
    requestId: 'request-1',
    auth: { userId: 'user-1', permissions: ['ai_scoring.jobs.view', 'users.delete'] },
    user: { email: 'admin@example.com' },
    get: name => name === 'idempotency-key' ? 'retry-1' : undefined,
  };
  assert.deepEqual(forwardedHeaders(req, [TENANT]), {
    'x-request-id': 'request-1',
    'x-admin-actor-id': 'user-1',
    'x-admin-actor-email': 'admin@example.com',
    'x-admin-permissions': 'ai_scoring.jobs.view',
    'x-admin-tenant-ids': TENANT,
    'idempotency-key': 'retry-1',
  });
});

const TENANT = '4fe58fc4-644e-452e-aacd-56523db1b2e7';

test('tenant scope is validated server-side configuration', () => {
  assert.deepEqual(parseTenantScope(''), []);
  assert.deepEqual(parseTenantScope(` ${TENANT.toUpperCase()} ,${TENANT}`), [TENANT]);
  assert.throws(() => parseTenantScope('*'));
  assert.throws(() => parseTenantScope('IIG'));
});

test('actors without AI Scoring permissions receive no tenant scope', () => {
  const req = { auth: { userId: 'user-1', permissions: ['users.view'] }, get: () => undefined };
  assert.equal(forwardedHeaders(req, [TENANT])['x-admin-tenant-ids'], '');
});

async function proxyCall(tenantIds, incomingHeaders = {}) {
  const calls = [];
  const client = { request: async config => { calls.push(config); return { status: 200, data: { ok: true }, headers: {} }; } };
  const router = createAiScoringAdminProxyRoutes({ client, tenantIds });
  const req = {
    method: 'GET', path: '/jobs', query: {}, body: undefined, requestId: 'request-1',
    headers: incomingHeaders, url: '/jobs', originalUrl: '/api/ai-scoring/jobs',
    auth: { userId: 'user-1', permissions: ['ai_scoring.jobs.view'] },
    user: { email: 'admin@example.com' },
    get: name => incomingHeaders[name.toLowerCase()],
  };
  let status; let caught;
  const res = { setHeader() {}, status(code) { status = code; return this; }, send() { return this; } };
  await new Promise(resolve => {
    res.send = () => { resolve(); return res; };
    router.handle(req, res, error => { caught = error; resolve(); });
  });
  return { calls, status, error: caught };
}

test('proxy forwards configured tenant scope and ignores browser-supplied tenant header', async () => {
  const { calls, status } = await proxyCall(TENANT, { 'x-admin-tenant-ids': '*' });
  assert.equal(status, 200);
  assert.equal(calls[0].headers['x-admin-tenant-ids'], TENANT);
});

test('proxy fails closed when tenant scope is not configured', async () => {
  const { calls, error } = await proxyCall('');
  assert.equal(calls.length, 0);
  assert.equal(error.code, 'AI_SCORING_ADMIN_TENANT_SCOPE_NOT_CONFIGURED');
});

test('Admin and AI Scoring apps expose BFF and versioned service routes while preserving legacy routes', () => {
  const root = path.resolve(__dirname, '..');
  const adminApp = fs.readFileSync(path.join(root, 'src/apps/admin/app.js'), 'utf8');
  const scoringApp = fs.readFileSync(path.join(root, 'src/apps/ai-scoring/app.js'), 'utf8');
  assert.match(adminApp, /\/api\/ai-scoring.*createAiScoringAdminProxyRoutes/s);
  assert.match(scoringApp, /\/api\/admin\/v1\/tenants.*authenticateAiScoringService/s);
  assert.match(scoringApp, /\/api\/ai-scoring\/tenants.*authenticate/s);
});

test('container runtime consumes isolated Scoring configuration without owning Scoring services', () => {
  const root = path.resolve(__dirname, '..');
  const compose = fs.readFileSync(path.join(root, 'deploy/docker-compose.yml'), 'utf8');
  const betaEnvironment = fs.readFileSync(path.join(root, 'deploy/.env.container.beta.example'), 'utf8');
  const productionEnvironment = fs.readFileSync(path.join(root, 'deploy/.env.container.example'), 'utf8');

  assert.doesNotMatch(compose, /^  scoring-api:|^  scoring-worker:/m);
  assert.match(compose, /env_file:\s*\[\.env\.container\]/);
  assert.match(betaEnvironment, /AI_SCORING_ADMIN_URL=https:\/\/ai-scoring-beta\.iigvn\.site/);
  assert.match(productionEnvironment, /AI_SCORING_ADMIN_URL=https:\/\/ai-scoring\.iigvn\.site/);
});

const { forwardedRequest } = require('../src/routes/aiScoringAdminProxyRoutes');
const OTHER_TENANT = '7a0e0a5e-1f6a-4c1e-9a43-2a4c8c1b9f10';

test('BFF fills tenantId from a single server-side scope and moves body tenantId to the query', () => {
  assert.deepEqual(forwardedRequest({ query: { limit: '20' } }, [TENANT]).query, { limit: '20', tenantId: TENANT });
  const replay = forwardedRequest({ query: {}, body: { tenantId: TENANT, reason: 'Receiver fixed' } }, [TENANT]);
  assert.deepEqual(replay, { query: { tenantId: TENANT }, body: { reason: 'Receiver fixed' } });
});

test('BFF rejects a browser-selected tenant outside the server-side scope', () => {
  assert.throws(() => forwardedRequest({ query: { tenantId: OTHER_TENANT } }, [TENANT]), error => error.code === 'AI_SCORING_TENANT_FORBIDDEN');
  assert.throws(() => forwardedRequest({ query: {} }, [TENANT, OTHER_TENANT]), error => error.code === 'AI_SCORING_TENANT_REQUIRED');
  assert.equal(forwardedRequest({ query: { tenantId: OTHER_TENANT } }, [TENANT, OTHER_TENANT]).query.tenantId, OTHER_TENANT);
});
