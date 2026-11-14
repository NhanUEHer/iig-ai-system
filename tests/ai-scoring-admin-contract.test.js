const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
