const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createConnectionsRouter } = require('../src/modules/ai-core/routes/connections');
const { createModelsRouter } = require('../src/modules/ai-core/routes/models');
const { createLogsRouter } = require('../src/modules/ai-core/routes/logs');
const { createLogService, csv } = require('../src/modules/ai-core/admin/logService');
const { createAudit } = require('../src/modules/ai-core/admin/audit');

async function invoke(router, method, pathName, { permissions = [], body = {}, query = {} } = {}) {
  const layer = router.stack.find(item => item.route?.methods?.[method.toLowerCase()] && item.matchers[0](pathName));
  assert.ok(layer, `route ${method} ${pathName} exists`);
  const match = layer.matchers[0](pathName);
  const req = { method, path: pathName, params: match.params, body, query, auth: { userId: '00000000-0000-0000-0000-000000000001', permissions } };
  const response = { status: 200, headers: {} };
  const res = {
    status(code) { response.status = code; return this; },
    setHeader(name, value) { response.headers[name] = value; },
    json(value) { response.body = value; return this; },
    send(value) { response.body = value; return this; },
  };
  let index = 0;
  async function next(error) {
    if (error) throw error;
    const current = layer.route.stack[index++];
    if (current) return current.handle(req, res, next);
  }
  try { await next(); } catch (error) { response.status = error.statusCode || 500; response.body = { code: error.code, message: error.message }; }
  return response;
}

test('connection routes enforce view/manage and never return provider keys', async () => {
  let createInput;
  const store = {
    async list() { return [{ id: 'c1', apiKeyLast4: '1234' }]; },
    async create(input) { createInput = input; return { id: 'c1', provider: input.provider, name: input.name, apiKeyLast4: input.apiKey.slice(-4) }; },
  };
  const router = createConnectionsRouter({ connectionStore: store, audit: { async write() {} } });
  assert.equal((await invoke(router, 'GET', '/')).status, 403);
  assert.equal((await invoke(router, 'POST', '/')).status, 403);
  const viewed = await invoke(router, 'GET', '/', { permissions: ['ai_core.view'] });
  assert.equal(viewed.status, 200);
  assert.deepEqual(viewed.body.data, [{ id: 'c1', apiKeyLast4: '1234' }]);
  const response = await invoke(router, 'POST', '/', {
    permissions: ['ai_core.manage'],
    body: { provider: 'gemini', name: 'Production', apiKey: 'secret-key-9876', baseUrl: 'https://example.com/' },
  });
  assert.equal(response.status, 201);
  const text = JSON.stringify(response.body);
  assert.doesNotMatch(text, /secret-key-9876|ciphertext|api_key/i);
  assert.equal(response.body.data.apiKeyLast4, '9876');
  assert.equal(createInput.baseUrl, 'https://example.com');
});

test('connection replacement keys are validated and public store DTO updates last4', async () => {
  let updated;
  const router = createConnectionsRouter({
    connectionStore: {
      async update(_id, patch) { updated = patch; return { id: 'c1', apiKeyLast4: patch.apiKey.slice(-4) }; },
    },
    audit: { async write() {} },
  });
  const short = await invoke(router, 'PATCH', '/c1', { permissions: ['ai_core.manage'], body: { apiKey: 'short' } });
  assert.equal(short.status, 400);
  const valid = await invoke(router, 'PATCH', '/c1', { permissions: ['ai_core.manage'], body: { apiKey: 'replacement-4321' } });
  assert.equal(valid.status, 200);
  assert.equal(valid.body.data.apiKeyLast4, '4321');
  assert.equal(updated.apiKey, 'replacement-4321');
});

test('model PUT rejects negative prices and accepts the documented DTO names', async () => {
  let saved;
  const router = createModelsRouter({
    priceStore: { async saveMany(items) { saved = items; return items.map(item => ({ ...item, in: item.priceIn, cachedIn: item.priceCachedIn, out: item.priceOut })); } },
    audit: { async write() {} },
  });
  const invalid = await invoke(router, 'PUT', '/', { permissions: ['ai_core.manage'], body: { items: [{ provider: 'gemini', model: 'm', priceIn: -1, priceCachedIn: 0, priceOut: 1, contextWindow: 100, status: 'active' }] } });
  assert.equal(invalid.status, 400);
  const valid = await invoke(router, 'PUT', '/', { permissions: ['ai_core.manage'], body: { items: [{ provider: 'gemini', model: 'm', priceIn: 1, priceCachedIn: 0, priceOut: 2, contextWindow: 100, status: 'active' }] } });
  assert.equal(valid.status, 200);
  assert.equal(saved[0].priceOut, 2);
  assert.equal(valid.body.data[0].priceIn, 1);
});

test('logs use stable created_at/id keyset pagination and CSV excludes previews', async () => {
  const firstRows = [
    { id: '00000000-0000-4000-8000-000000000003', created_at: '2026-11-18T03:00:00Z', agent_key: 'a.one' },
    { id: '00000000-0000-4000-8000-000000000002', created_at: '2026-11-18T02:00:00Z', agent_key: 'a.one' },
    { id: '00000000-0000-4000-8000-000000000001', created_at: '2026-11-18T01:00:00Z', agent_key: 'a.one' },
  ];
  const calls = [];
  const service = createLogService({ async query(sql, params) { calls.push({ sql, params }); return { rows: calls.length === 1 ? firstRows : firstRows.slice(2) }; } });
  const page = await service.list({ pageSize: 2 });
  assert.equal(page.items.length, 2);
  assert.ok(page.nextCursor);
  await service.list({ pageSize: 2, cursor: page.nextCursor });
  assert.match(calls[1].sql, /\(created_at,id\)</);
  assert.deepEqual(calls[1].params.slice(0, 2), ['2026-11-18T02:00:00.000Z', '00000000-0000-4000-8000-000000000002']);
  const exported = csv([{ id: '1', agentKey: 'a.one', requestPreview: 'private prompt', responsePreview: 'private output' }]);
  assert.match(exported, /^id,createdAt,agentKey/);
  assert.doesNotMatch(exported, /requestPreview|responsePreview|private prompt|private output/);
});

test('log detail requests previews only for ai_core.manage', async () => {
  const flags = [];
  const router = createLogsRouter({ logService: { async detail(_id, includePreview) { flags.push(includePreview); return includePreview ? { id: 'l1', requestPreview: 'prompt' } : { id: 'l1' }; } } });
  const viewer = await invoke(router, 'GET', '/l1', { permissions: ['ai_core.view'] });
  const manager = await invoke(router, 'GET', '/l1', { permissions: ['ai_core.manage'] });
  assert.deepEqual(flags, [false, true]);
  assert.equal(Object.hasOwn(viewer.body.data, 'requestPreview'), false);
  assert.equal(manager.body.data.requestPreview, 'prompt');
});

test('frontend AI Core service uses the shared API client and exposes both task surfaces', () => {
  const source = fs.readFileSync(path.join(__dirname, '../frontend/src/features/ai-core/services/aiCoreApi.js'), 'utf8');
  assert.match(source, /import api from '\.\.\/\.\.\/\.\.\/services\/api'/);
  for (const name of ['listConnections', 'saveModels', 'listLogs', 'getUsage', 'createAgent', 'testAgent', 'publishAgent', 'runAgent']) {
    assert.match(source, new RegExp(`export const ${name}\\b`));
  }
});

test('AI Core audit migration is append-only and audit field metadata excludes credential names', async () => {
  const migration = fs.readFileSync(path.join(__dirname, '../src/database/migrations/155_ai_core_audit.sql'), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS aic_audit_logs/);
  assert.match(migration, /actor_id UUID/);
  assert.match(migration, /changed_fields JSONB/);
  assert.doesNotMatch(migration, /api_key|ciphertext|secret/i);
  let params;
  await createAudit({ async query(_sql, values) { params = values; return { rows: [] }; } }).write({
    resourceType: 'agent', resourceId: 'demo.agent', action: 'saved',
    fields: ['apiKey', 'maxInputTokens', 'password'],
  });
  assert.deepEqual(JSON.parse(params[4]), ['maxInputTokens']);
});

test('model PUT refuses to enable a model the provider no longer offers or without context', async () => {
  const router = createModelsRouter({
    priceStore: {
      async list() { return [{ provider: 'deepseek', model: 'gone', providerAvailable: false }]; },
      async saveMany(items) { return items; },
    },
    audit: { async write() {} },
  });
  const gone = await invoke(router, 'PUT', '/', { permissions: ['ai_core.manage'], body: { items: [{ provider: 'deepseek', model: 'gone', priceIn: 1, priceCachedIn: 0, priceOut: 1, contextWindow: 100, status: 'active' }] } });
  assert.equal(gone.status, 400);
  const noContext = await invoke(router, 'PUT', '/', { permissions: ['ai_core.manage'], body: { items: [{ provider: 'deepseek', model: 'new', priceIn: 1, priceCachedIn: 0, priceOut: 1, contextWindow: 0, status: 'active' }] } });
  assert.equal(noContext.status, 400);
  const disabledOk = await invoke(router, 'PUT', '/', { permissions: ['ai_core.manage'], body: { items: [{ provider: 'deepseek', model: 'new', priceIn: 0, priceCachedIn: 0, priceOut: 0, contextWindow: 0, status: 'disabled' }] } });
  assert.equal(disabledOk.status, 200);
});
