-- Durable operator commands for AI Scoring job recovery.

ALTER TABLE iig_ai_scoring_runs
  ADD COLUMN IF NOT EXISTS retry_of_run_id UUID REFERENCES iig_ai_scoring_runs(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_iig_ai_scoring_runs_retry_lineage
  ON iig_ai_scoring_runs(retry_of_run_id)
  WHERE retry_of_run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ai_scoring_job_operator_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES iig_scoring_jobs(id) ON DELETE RESTRICT,
  source_run_id UUID REFERENCES iig_ai_scoring_runs(id) ON DELETE RESTRICT,
  result_run_id UUID REFERENCES iig_ai_scoring_runs(id) ON DELETE RESTRICT,
  action VARCHAR(32) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  actor_id UUID,
  reason TEXT NOT NULL,
  request_id VARCHAR(120) NOT NULL,
  before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_ai_scoring_job_operator_command UNIQUE (job_id, action, idempotency_key),
  CONSTRAINT chk_ai_scoring_job_operator_action CHECK (action IN ('RETRY', 'CANCEL', 'RESCORE', 'RECONCILE')),
  CONSTRAINT chk_ai_scoring_job_operator_reason CHECK (char_length(btrim(reason)) BETWEEN 3 AND 1000),
  CONSTRAINT chk_ai_scoring_job_operator_idempotency CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  CONSTRAINT chk_ai_scoring_job_operator_before CHECK (jsonb_typeof(before_state) = 'object'),
  CONSTRAINT chk_ai_scoring_job_operator_after CHECK (jsonb_typeof(after_state) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_ai_scoring_job_operator_commands_job
  ON ai_scoring_job_operator_commands(job_id, created_at DESC);

UPDATE roles
SET permissions = permissions || '["ai_scoring.operations.retry"]'::jsonb
WHERE slug = 'admin' AND NOT permissions ? 'ai_scoring.operations.retry';
