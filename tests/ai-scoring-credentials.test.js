const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const validator = require('../src/modules/ai-scoring-credentials/credentialValidator');
const credentialServiceModule = require('../src/modules/ai-scoring-credentials/credentialService');
const { createIigIntegrationAuth, requireIntegrationScope } = require('../src/middleware/iigIntegrationAuth');

const migrationSql = fs.readFileSync(path.join(__dirname, '../src/database/migrations/128_ai_scoring_api_credentials.sql'), 'utf8');
const lineageSql = fs.readFileSync(path.join(__dirname, '../src/database/migrations/129_ai_scoring_job_credential_lineage.sql'), 'utf8');

test('credential migration stores only hashes and preserves tenant lineage', () => {
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS integration_api_credentials/i);
  assert.match(migrationSql, /token_hash CHAR\(64\) NOT NULL/i);
  assert.match(migrationSql, /UNIQUE \(token_hash\)/i);
  assert.match(lineageSql, /ADD COLUMN IF NOT EXISTS credential_id UUID/i);
  assert.doesNotMatch(migrationSql, /raw_token|token_secret/i);
});

test('credential material is random and exposes only a stable prefix and sha256 hash', () => {
  const first = credentialServiceModule.generateMaterial('PRODUCTION');
  const second = credentialServiceModule.generateMaterial('PRODUCTION');
  assert.match(first.token, /^iig_live_[A-Za-z0-9_-]{40,}$/);
  assert.match(first.hash, /^[0-9a-f]{64}$/);
  assert.equal(first.prefix, first.token.slice(0, 16));
  assert.notEqual(first.token, second.token);
  assert.notEqual(first.hash, second.hash);
});

test('credential validator requires scopes and a future expiry', () => {
  assert.throws(() => validator.createInput({ name: 'Production', scopes: [] }), error => error.details.field === 'scopes');
  assert.throws(() => validator.createInput({ name: 'Production', scopes: ['jobs:create'], expiresAt: '2020-01-01T00:00:00Z' }), error => error.details.field === 'expiresAt');
  assert.deepEqual(validator.createInput({ name: ' Production ', scopes: ['jobs:create', 'jobs:create'] }).scopes, ['jobs:create']);
});

test('credential scopes cannot exceed tenant allowed scopes', () => {
  assert.throws(
    () => credentialServiceModule.ensureScopes({ allowed_scopes: ['jobs:read'] }, ['jobs:create']),
    error => error.code === 'CREDENTIAL_SCOPE_EXCEEDED' && error.statusCode === 422
  );
});

test('credential service returns secret once while repository receives only hash material', async () => {
  let persistedMaterial;
  const repository = {
    tenantById: async () => ({ id: 'tenant-1', environment: 'BETA', status: 'ACTIVE', allowed_scopes: ['jobs:create'] }),
    create: async (_tenantId, _input, material) => {
      persistedMaterial = material;
      return { credential: { id: 'credential-1', tokenPrefix: material.prefix } };
    },
  };
  const service = new credentialServiceModule.CredentialService(repository);
  const created = await service.create('tenant-1', { name: 'Beta key', scopes: ['jobs:create'] }, {});
  assert.match(created.secret, /^iig_beta_/);
  assert.equal(persistedMaterial.token, undefined);
  assert.match(persistedMaterial.hash, /^[0-9a-f]{64}$/);
  assert.equal(created.tokenHash, undefined);
});

function request(token) {
  return { ip: '127.0.0.1', get: name => name.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined };
}

test('tenant credential auth accepts active tenant and rejects suspended tenant generically', async () => {
  const activeRepository = {
    findActiveByHash: async () => ({ id: 'credential-1', tenant_id: 'tenant-1', tenant_code: 'ACME', tenant_status: 'ACTIVE', scopes: ['jobs:read'], rate_limit_per_minute: 60 }),
    touchLastUsed: async () => {},
  };
  const auth = createIigIntegrationAuth({ apiKey: '', repository: activeRepository });
  const req = request('tenant-secret');
  let result;
  await auth(req, {}, error => { result = error || 'ok'; });
  assert.equal(result, 'ok');
  assert.equal(req.integration.partner, 'ACME');
  assert.equal(req.integration.credentialId, 'credential-1');

  const suspendedAuth = createIigIntegrationAuth({ apiKey: '', repository: { ...activeRepository, findActiveByHash: async () => ({ tenant_status: 'SUSPENDED' }) } });
  await suspendedAuth(request('tenant-secret'), {}, error => { result = error; });
  assert.equal(result.code, 'INTEGRATION_AUTH_INVALID');
});

test('integration scope guard denies missing scope', () => {
  const guard = requireIntegrationScope('jobs:create');
  let result;
  guard({ integration: { scopes: ['jobs:read'] } }, {}, error => { result = error; });
  assert.equal(result.code, 'INTEGRATION_SCOPE_DENIED');
});
