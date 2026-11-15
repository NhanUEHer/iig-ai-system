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

test('tenant frontend uses the Admin API cursor contract and page-local counts', () => {
  const source = fs.readFileSync(path.join(
    __dirname,
    '../frontend/src/features/ai-scoring-tenants/pages/TenantManagementPage.jsx'
  ), 'utf8');
  assert.match(source, /CursorPagination/);
  assert.match(source, /listTenants\(\{[\s\S]*?limit,[\s\S]*?cursor: cursors\.at\(-1\)/);
  assert.match(source, /cursors\.length \* limit \+ index \+ 1/);
  assert.match(source, /count=\{result\.items\.length\}/);
  assert.match(source, /hasNext=\{Boolean\(result\.nextCursor\)\}/);
  assert.doesNotMatch(source, /pageSize:|result\.pageSize|result\.total|pageCount/);
});

test('tenant webhook delivery preview requests a cursor-compatible limit', () => {
  const source = fs.readFileSync(path.join(
    __dirname,
    '../frontend/src/features/ai-scoring-tenants/components/TenantWebhooksPanel.jsx'
  ), 'utf8');
  assert.match(source, /listWebhookDeliveries\(\{ tenantId: tenant\.id, limit: 10 \}\)/);
  assert.doesNotMatch(source, /listWebhookDeliveries\([^\n]*pageSize/);
});
