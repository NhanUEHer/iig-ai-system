const ADMIN_MIGRATION_LOCK = 'iig-admin-schema-migrations';

// These migrations now belong to the standalone AI Scoring backend. Keep the
// historical files in this repository for auditability, but never apply them
// to a fresh IIG Admin database.
const EXTERNALIZED_AI_SCORING_MIGRATIONS = new Set([
  '121_iig_scoring_ingestion_foundation.sql',
  '122_iig_question_transcriptions.sql',
  '123_iig_ai_scoring_foundation.sql',
  '124_iig_ai_evidence_execution_stages.sql',
  '125_iig_speaking_completion.sql',
  '126_ai_scoring_tenant_management.sql',
  '128_ai_scoring_api_credentials.sql',
  '129_ai_scoring_job_credential_lineage.sql',
  '130_ai_scoring_webhooks.sql',
  '131_ai_scoring_webhook_delivery_dedup.sql',
  '132_ai_scoring_webhook_failed_job_events.sql',
  '133_ai_scoring_job_admin_list.sql',
  '134_ai_scoring_job_detail_permissions.sql',
  '135_ai_scoring_job_retry_operations.sql',
  '136_ai_scoring_job_cancel_operation.sql',
  '137_ai_scoring_job_rescore_operation.sql',
  '138_ai_scoring_job_reconcile_operation.sql',
  '139_ai_scoring_step_retry_operation.sql',
  '140_iig_question_resolution_contract.sql',
  '141_scoring_job_tenant_ownership.sql',
  '142_iig_scoring_failure_recovery.sql',
  '143_iig_scoring_job_attempts.sql',
  '144_iig_plan_driven_completion.sql',
  '145_iig_ai_section_statuses.sql',
  '146_ai_scoring_audit_permission.sql',
]);

function isAdminOwnedMigration(fileName) {
  return fileName.endsWith('.sql') && !EXTERNALIZED_AI_SCORING_MIGRATIONS.has(fileName);
}

module.exports = {
  ADMIN_MIGRATION_LOCK,
  EXTERNALIZED_AI_SCORING_MIGRATIONS,
  isAdminOwnedMigration,
};
