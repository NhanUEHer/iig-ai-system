ALTER TABLE dictionary_generations DROP CONSTRAINT IF EXISTS dictionary_generation_status_check;
ALTER TABLE dictionary_generations ADD CONSTRAINT dictionary_generation_status_check
  CHECK (status IN ('draft','generating','partial','completed','failed'));

CREATE TABLE IF NOT EXISTS dictionary_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES dictionary_generations(id) ON DELETE CASCADE,
  original_chunk TEXT NOT NULL,
  display_order SMALLINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT dictionary_candidate_order_unique UNIQUE (generation_id, display_order),
  CONSTRAINT dictionary_candidate_status_check CHECK (status IN ('pending','generating','completed','failed'))
);

ALTER TABLE dictionary_entries ADD COLUMN IF NOT EXISTS candidate_id UUID REFERENCES dictionary_candidates(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS dictionary_entries_candidate_unique ON dictionary_entries(candidate_id) WHERE candidate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS dictionary_candidates_generation_idx ON dictionary_candidates(generation_id, display_order);
