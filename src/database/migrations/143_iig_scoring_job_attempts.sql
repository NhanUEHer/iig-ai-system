-- Allow one source scoring record to be intentionally graded more than once.
-- Active attempts are serialized by ScoringJobRepository; completed attempts
-- remain immutable history.

ALTER TABLE iig_scoring_jobs
  DROP CONSTRAINT IF EXISTS uq_iig_scoring_jobs_source_key;

ALTER TABLE iig_scoring_jobs
  DROP CONSTRAINT IF EXISTS uq_iig_scoring_jobs_partner_scoring;

ALTER TABLE iig_submissions
  DROP CONSTRAINT IF EXISTS uq_iig_submissions_source;

CREATE INDEX IF NOT EXISTS idx_iig_scoring_jobs_source_attempts
  ON iig_scoring_jobs(partner, source_scoring_id, accepted_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_iig_submissions_source_attempts
  ON iig_submissions(partner, source_scoring_id, created_at DESC, id DESC);
