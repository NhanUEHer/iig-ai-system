const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  ADMIN_MIGRATION_LOCK,
  EXTERNALIZED_AI_SCORING_MIGRATIONS,
  isAdminOwnedMigration,
} = require('../src/database/migrationOwnership');

const migrationsDir = path.join(__dirname, '..', 'src', 'database', 'migrations');

test('IIG Admin excludes only the exact AI Scoring-owned migration history', () => {
  assert.equal(EXTERNALIZED_AI_SCORING_MIGRATIONS.size, 25);

  for (const migration of EXTERNALIZED_AI_SCORING_MIGRATIONS) {
    assert.equal(fs.existsSync(path.join(migrationsDir, migration)), true, migration);
    assert.equal(isAdminOwnedMigration(migration), false, migration);
  }

  for (const migration of [
    '121_toefl_complete_words.sql',
    '122_exam_test_type_and_toefl_listening_timing.sql',
    '127_exam_test_type_and_toefl_listening_timing.sql',
    '128_allow_current_sub_question_types.sql',
    '147_key_vocab_legacy_passage_compatibility.sql',
    '148_ai_scoring_admin_permissions.sql',
  ]) {
    assert.equal(isAdminOwnedMigration(migration), true, migration);
  }
});

test('IIG Admin uses its own migration advisory lock', () => {
  assert.equal(ADMIN_MIGRATION_LOCK, 'iig-admin-schema-migrations');
  assert.notEqual(ADMIN_MIGRATION_LOCK, 'ai-scoring-schema-migrations');
});

test('fresh IIG Admin databases retain every AI Scoring BFF permission', () => {
  const sql = fs.readFileSync(
    path.join(migrationsDir, '148_ai_scoring_admin_permissions.sql'),
    'utf8'
  );
  const requiredPermissions = [
    'ai_scoring.tenants.view',
    'ai_scoring.tenants.manage',
    'ai_scoring.credentials.view',
    'ai_scoring.credentials.manage',
    'ai_scoring.webhooks.view',
    'ai_scoring.webhooks.manage',
    'ai_scoring.webhooks.replay',
    'ai_scoring.jobs.view',
    'ai_scoring.jobs.export',
    'ai_scoring.jobs.view_detail',
    'ai_scoring.jobs.view_model_lineage',
    'ai_scoring.operations.retry',
    'ai_scoring.operations.cancel',
    'ai_scoring.operations.rescore',
    'ai_scoring.operations.reconcile',
    'ai_scoring.audit.view',
  ];

  for (const permission of requiredPermissions) {
    assert.match(sql, new RegExp(permission.replaceAll('.', '\\.')));
  }

  assert.match(sql, /UNION\s+SELECT permission FROM required_permissions/);
  assert.match(sql, /jsonb_agg\(permission ORDER BY permission\)/);
});
