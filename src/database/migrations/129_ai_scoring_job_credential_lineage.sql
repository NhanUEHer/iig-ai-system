-- Preserve the accepted credential identity on every new tenant scoring job.

ALTER TABLE iig_scoring_jobs
  ADD COLUMN IF NOT EXISTS credential_id UUID REFERENCES integration_api_credentials(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_iig_scoring_jobs_credential
  ON iig_scoring_jobs(credential_id, accepted_at DESC);
