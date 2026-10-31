const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { requirePermission } = require('../src/middleware/authenticate');
const { AuditService } = require('../src/modules/ai-scoring-audit/auditService');

const permissionMatrix = [
  'ai_scoring.tenants.manage', 'ai_scoring.credentials.manage',
  'ai_scoring.webhooks.manage', 'ai_scoring.webhooks.replay',
  'ai_scoring.jobs.view', 'ai_scoring.jobs.view_detail',
  'ai_scoring.jobs.view_model_lineage', 'ai_scoring.jobs.export',
  'ai_scoring.operations.retry', 'ai_scoring.operations.cancel',
  'ai_scoring.operations.rescore', 'ai_scoring.operations.reconcile',
  'ai_scoring.audit.view',
];

test('AI Scoring permission middleware returns 403 for every missing permission', () => {
  for (const permission of permissionMatrix) {
    let failure;
    requirePermission(permission)({ auth: { permissions: [] } }, {}, error => { failure = error; });
    assert.equal(failure.statusCode, 403, permission);
    assert.equal(failure.code, 'PERMISSION_DENIED', permission);
  }
});

test('audit routes and tenant audit require the dedicated audit permission', () => {
  const auditRoutes = fs.readFileSync(path.join(__dirname, '../src/routes/aiScoringAuditRoutes.js'), 'utf8');
  const tenantRoutes = fs.readFileSync(path.join(__dirname, '../src/routes/aiScoringTenantRoutes.js'), 'utf8');
  assert.match(auditRoutes, /requirePermission\('ai_scoring\.audit\.view'\)/);
  assert.match(tenantRoutes, /audit-events', requirePermission\('ai_scoring\.audit\.view'\)/);
});

test('audit service validates filters and returns bounded pages', async () => {
  let input;
  const service = new AuditService({ list: async value => { input = value; return { items: [], total: 0, page: value.page, pageSize: value.pageSize }; } });
  await service.list({ page: '2', pageSize: '999', outcome: 'FAILED' });
  assert.equal(input.page, 2);
  assert.equal(input.pageSize, 100);
  await assert.rejects(() => service.list({ outcome: 'UNKNOWN' }), error => error.code === 'INVALID_AUDIT_OUTCOME');
});

test('frontend does not inherit webhook privileges from tenant manage', () => {
  const source = fs.readFileSync(path.join(__dirname, '../frontend/src/features/ai-scoring-tenants/pages/TenantManagementPage.jsx'), 'utf8');
  assert.doesNotMatch(source, /const canManageWebhooks = canManage \|\|/);
  assert.doesNotMatch(source, /const canReplayWebhooks = canManage \|\|/);
  assert.match(source, /ai_scoring\.audit\.view/);
});

test('failed mutation audit stores only a stable error code, never request body', () => {
  const failureSource = fs.readFileSync(path.join(__dirname, '../src/modules/ai-scoring-audit/auditFailure.js'), 'utf8');
  const repositorySource = fs.readFileSync(path.join(__dirname, '../src/modules/ai-scoring-audit/auditRepository.js'), 'utf8');
  assert.match(repositorySource, /errorCode/);
  assert.doesNotMatch(failureSource, /JSON\.stringify\(req\.body\)/);
  assert.doesNotMatch(repositorySource, /JSON\.stringify\(req\.body\)/);
});

test('all AI Scoring mutation controllers use the failed audit wrapper', () => {
  for (const file of [
    'aiScoringTenantController.js', 'aiScoringCredentialController.js',
    'aiScoringWebhookController.js', 'aiScoringJobController.js',
  ]) {
    const source = fs.readFileSync(path.join(__dirname, `../src/controllers/${file}`), 'utf8');
    assert.match(source, /audited\(/, file);
  }
});
