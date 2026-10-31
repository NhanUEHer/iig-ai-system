const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const validator = require('../src/modules/ai-scoring-tenants/tenantValidator');
const tenantServiceModule = require('../src/modules/ai-scoring-tenants/tenantService');

const migrationSql = fs.readFileSync(path.join(
  __dirname,
  '../src/database/migrations/126_ai_scoring_tenant_management.sql'
), 'utf8');

test('tenant migration preserves status, uniqueness and append-only audit invariants', () => {
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS integration_tenants/i);
  assert.match(migrationSql, /code VARCHAR\(40\) NOT NULL/i);
  assert.match(migrationSql, /CONSTRAINT uq_integration_tenants_code UNIQUE \(code\)/i);
  assert.match(migrationSql, /status IN \('ACTIVE', 'SUSPENDED', 'DISABLED'\)/i);
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS ai_scoring_admin_audit_events/i);
  assert.match(migrationSql, /ai_scoring\.tenants\.view/i);
  assert.match(migrationSql, /ai_scoring\.tenants\.manage/i);
  assert.doesNotMatch(migrationSql, /ON DELETE CASCADE/i);
});

test('tenant create input normalizes code and defaults', () => {
  const input = validator.createInput({ code: 'iig_vn', name: ' IIG Vietnam ' });
  assert.equal(input.code, 'IIG_VN');
  assert.equal(input.name, 'IIG Vietnam');
  assert.equal(input.environment, 'PRODUCTION');
  assert.equal(input.rateLimit, 120);
  assert.deepEqual(input.allowedScopes, []);
});

test('tenant validator rejects invalid code, email and rate limit', () => {
  assert.throws(() => validator.createInput({ code: '1', name: 'Tenant' }), error => error.code === 'TENANT_VALIDATION_FAILED');
  assert.throws(() => validator.createInput({ code: 'TENANT', name: 'Tenant', contactEmail: 'invalid' }), error => error.details.field === 'contactEmail');
  assert.throws(() => validator.createInput({ code: 'TENANT', name: 'Tenant', rateLimit: 0 }), error => error.details.field === 'rateLimit');
});

test('tenant update rejects immutable code', () => {
  assert.throws(() => validator.updateInput({ code: 'NEW_CODE', name: 'Tenant' }), error => error.code === 'TENANT_CODE_IMMUTABLE' && error.statusCode === 422);
});

test('tenant list input bounds pagination and validates filters', () => {
  assert.deepEqual(validator.listInput({ page: '-2', pageSize: '1000', status: 'active' }), {
    page: 1, pageSize: 100, search: '', status: 'ACTIVE', environment: null,
  });
  assert.throws(() => validator.listInput({ status: 'REMOVED' }), error => error.details.field === 'status');
});

test('tenant status mutation requires a reason', () => {
  assert.throws(() => validator.statusReason({}), error => error.details.field === 'reason');
  assert.equal(validator.statusReason({ reason: ' Security review ' }), 'Security review');
});

test('tenant service maps duplicate code to stable 409 error', async () => {
  const duplicate = Object.assign(new Error('duplicate'), { code: '23505' });
  const service = new tenantServiceModule.TenantService({ create: async () => { throw duplicate; } });
  await assert.rejects(() => service.create({ code: 'TENANT', name: 'Tenant' }, {}), error => error.code === 'TENANT_CODE_EXISTS' && error.statusCode === 409);
});

test('tenant service returns stable not-found error', async () => {
  const service = new tenantServiceModule.TenantService({ findById: async () => null });
  await assert.rejects(() => service.detail('0b732271-9d67-4b47-93da-aea671df0f20'), error => error.code === 'TENANT_NOT_FOUND' && error.statusCode === 404);
});
