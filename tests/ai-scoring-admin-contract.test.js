// Contract is owned by iig-ai-scoring-backend; update only via scripts/sync-ai-scoring-contract.sh.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'contracts/ai-scoring-admin-api-v1.json'), 'utf8'));
const shape = value => value.replace(/:[A-Za-z]+/g, ':p');
const contract = new Map(manifest.endpoints.map(endpoint => [`${endpoint.method} ${shape(endpoint.path)}`, endpoint]));

function frontendCalls() {
  const calls = [];
  for (const file of ['aiScoringJobService.js', 'aiScoringTenantService.js']) {
    const source = fs.readFileSync(path.join(root, 'frontend/src/services', file), 'utf8');
    for (const match of source.matchAll(/api\.(get|post|patch|put|delete)\(\s*[`'](\/ai-scoring[^`'?]*)[`']/g)) {
      const method = match[1].toUpperCase();
      const raw = match[2].replace('/ai-scoring', '/api/admin/v1');
      // `${action}` on tenants is the activate|suspend state change.
      const paths = raw.includes('${action}')
        ? ['activate', 'suspend'].map(action => raw.replace('${action}', action))
        : [raw];
      for (const value of paths) {
        calls.push({ file, method, path: value.replace(/\$\{[^}]+\}/g, ':p') });
      }
    }
  }
  return calls;
}

test('every Admin frontend AI Scoring call is part of the Admin Scoring API v1 contract', () => {
  const calls = frontendCalls();
  assert.ok(calls.length >= 30, 'frontend call extraction looks broken');
  const unknown = calls.filter(call => !contract.has(`${call.method} ${shape(call.path)}`));
  assert.deepEqual(unknown, []);
});

test('every Admin frontend AI Scoring mutation sends an Idempotency-Key', () => {
  for (const file of ['aiScoringJobService.js', 'aiScoringTenantService.js']) {
    const source = fs.readFileSync(path.join(root, 'frontend/src/services', file), 'utf8');
    const mutations = source.split('\n').filter(line => /api\.(post|patch|put|delete)\(/.test(line));
    assert.ok(mutations.length > 0);
    for (const line of mutations) assert.match(line, /idempotencyConfig\(\)/, `${file}: ${line.trim()}`);
  }
});

test('contract manifest reports which frontend calls Scoring has not implemented yet', (t) => {
  const pending = frontendCalls().filter(call => contract.get(`${call.method} ${shape(call.path)}`)?.status === 'pending');
  t.diagnostic(`pending Scoring endpoints used by Admin frontend: ${pending.length}`);
  assert.ok(Array.isArray(pending));
});

test('frontend AI Scoring lists only accept query keys supported by Scoring DTOs', async () => {
  // The manifest documents cursor pagination but does not enumerate query parameters.
  // Keep these allow-lists aligned with AdminJobListQuery, AdminTenantListQuery,
  // AdminAuditListQuery and AdminWebhookDeliveryListQuery, all extending AdminCursorQuery.
  const expected = {
    jobs: ['limit', 'cursor', 'search', 'status', 'scope', 'from', 'to', 'hasRetry', 'tenantId'],
    tenants: ['limit', 'cursor', 'search', 'status', 'environment', 'tenantId'],
    tenantAudit: ['limit', 'cursor', 'tenantId'],
    webhookDeliveries: ['limit', 'cursor', 'tenantId'],
  };
  const queryModuleUrl = pathToFileURL(path.join(root, 'frontend/src/services/aiScoringListQuery.js')).href;
  const { AI_SCORING_LIST_QUERY_KEYS, aiScoringListQuery } = await import(queryModuleUrl);
  assert.deepEqual(AI_SCORING_LIST_QUERY_KEYS, expected);

  for (const endpoint of Object.keys(expected)) {
    assert.throws(() => aiScoringListQuery(endpoint, { page: 1 }), /Unsupported/);
    assert.throws(() => aiScoringListQuery(endpoint, { pageSize: 25 }), /Unsupported/);
    assert.throws(() => aiScoringListQuery(endpoint, { unexpected: true }), /Unsupported/);
  }

  const jobService = fs.readFileSync(path.join(root, 'frontend/src/services/aiScoringJobService.js'), 'utf8');
  const tenantService = fs.readFileSync(path.join(root, 'frontend/src/services/aiScoringTenantService.js'), 'utf8');
  assert.match(jobService, /listScoringJobs[\s\S]*?aiScoringListQuery\('jobs', params\)/);
  assert.match(tenantService, /listTenants[\s\S]*?aiScoringListQuery\('tenants', params\)/);
  assert.match(tenantService, /listTenantAudit[\s\S]*?aiScoringListQuery\('tenantAudit', params\)/);
  assert.match(tenantService, /listWebhookDeliveries[\s\S]*?aiScoringListQuery\('webhookDeliveries', params\)/);
});
