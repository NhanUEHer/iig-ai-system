-- Admin job-list permissions and bounded read indexes.
CREATE INDEX IF NOT EXISTS idx_iig_scoring_jobs_accepted_id
  ON iig_scoring_jobs(accepted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_iig_scoring_jobs_status_accepted
  ON iig_scoring_jobs(status, accepted_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_iig_scoring_jobs_scoring_id
  ON iig_scoring_jobs(source_scoring_id);

UPDATE roles
SET permissions = permissions || '["ai_scoring.jobs.view","ai_scoring.jobs.export"]'::jsonb
WHERE slug = 'admin'
  AND NOT (permissions ? 'ai_scoring.jobs.view' AND permissions ? 'ai_scoring.jobs.export');
