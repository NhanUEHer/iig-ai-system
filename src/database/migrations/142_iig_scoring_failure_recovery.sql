-- Preserve explicit retry lineage without mutating a terminal scoring attempt.

ALTER TABLE iig_scoring_jobs
  ADD COLUMN IF NOT EXISTS retry_of_job_id UUID
    REFERENCES iig_scoring_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_iig_scoring_jobs_retry_of
  ON iig_scoring_jobs(retry_of_job_id, accepted_at DESC)
  WHERE retry_of_job_id IS NOT NULL;
