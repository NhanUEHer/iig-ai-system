const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { authenticateAiScoringService, parsePermissions } = require('../src/middleware/authenticateAiScoringService');
const { createAiScoringAdminClient } = require('../src/clients/aiScoringAdminClient');
const { forwardedHeaders } = require('../src/routes/aiScoringAdminProxyRoutes');

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
  assert.deepEqual(forwardedHeaders(req), {
    'x-request-id': 'request-1',
    'x-admin-actor-id': 'user-1',
    'x-admin-actor-email': 'admin@example.com',
    'x-admin-permissions': 'ai_scoring.jobs.view',
    'idempotency-key': 'retry-1',
  });
});

test('Admin and AI Scoring apps expose BFF and versioned service routes while preserving legacy routes', () => {
  const root = path.resolve(__dirname, '..');
  const adminApp = fs.readFileSync(path.join(root, 'src/apps/admin/app.js'), 'utf8');
  const scoringApp = fs.readFileSync(path.join(root, 'src/apps/ai-scoring/app.js'), 'utf8');
  assert.match(adminApp, /\/api\/ai-scoring.*createAiScoringAdminProxyRoutes/s);
  assert.match(scoringApp, /\/api\/admin\/v1\/tenants.*authenticateAiScoringService/s);
  assert.match(scoringApp, /\/api\/ai-scoring\/tenants.*authenticate/s);
});

test('container runtime routes the Admin BFF through the scoring service network alias', () => {
  const root = path.resolve(__dirname, '..');
  const compose = fs.readFileSync(path.join(root, 'deploy/docker-compose.yml'), 'utf8');

  assert.match(compose, /AI_SCORING_ADMIN_URL:\s*http:\/\/scoring-api:3002/);
});
