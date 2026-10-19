ALTER TABLE dictionary_candidates DROP CONSTRAINT IF EXISTS dictionary_candidate_status_check;
ALTER TABLE dictionary_candidates ADD CONSTRAINT dictionary_candidate_status_check
  CHECK (status IN ('pending','queued','generating','completed','failed'));

ALTER TABLE dictionary_candidates
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- A deployment or process restart must not leave work permanently stuck.
UPDATE dictionary_candidates
SET status = 'queued', next_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE status = 'generating';

CREATE INDEX IF NOT EXISTS dictionary_candidates_queue_idx
  ON dictionary_candidates(status, next_attempt_at, updated_at)
  WHERE status = 'queued';

CREATE TABLE IF NOT EXISTS dictionary_generation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES dictionary_generations(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES dictionary_candidates(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','failed')),
  request_payload JSONB NOT NULL,
  response_payload JSONB,
  workflow_run_id TEXT,
  error_code TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  CONSTRAINT dictionary_attempt_number_unique UNIQUE(candidate_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS dictionary_attempts_candidate_idx
  ON dictionary_generation_attempts(candidate_id, attempt_number DESC);

