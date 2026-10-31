-- Rescore permission and explicit run lineage.

ALTER TABLE iig_ai_scoring_runs
  ADD COLUMN IF NOT EXISTS rescore_of_run_id UUID REFERENCES iig_ai_scoring_runs(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_iig_ai_scoring_runs_rescore_lineage
  ON iig_ai_scoring_runs(rescore_of_run_id)
  WHERE rescore_of_run_id IS NOT NULL;

UPDATE roles
SET permissions = permissions || '["ai_scoring.operations.rescore"]'::jsonb
WHERE slug = 'admin' AND NOT permissions ? 'ai_scoring.operations.rescore';
