const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
