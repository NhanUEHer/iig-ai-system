-- Track the AI scoring lifecycle separately from ingestion readiness.
-- Ingestion can be READY_FOR_AI while the four isolated Speaking scoring runs
-- are still processing.

ALTER TABLE iig_submissions
  ADD COLUMN IF NOT EXISTS ai_scoring_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS ai_scoring_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_scoring_completed_at TIMESTAMPTZ;

ALTER TABLE iig_submissions
  DROP CONSTRAINT IF EXISTS chk_iig_submissions_ai_scoring_status;

ALTER TABLE iig_submissions
  ADD CONSTRAINT chk_iig_submissions_ai_scoring_status CHECK (ai_scoring_status IN (
    'PENDING', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ISSUES', 'FAILED'
  ));

CREATE INDEX IF NOT EXISTS idx_iig_submissions_ai_scoring_status
  ON iig_submissions(ai_scoring_status, updated_at DESC);
