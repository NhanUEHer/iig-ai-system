ALTER TABLE dictionary_candidates
  ADD COLUMN IF NOT EXISTS source_sentence TEXT;

CREATE INDEX IF NOT EXISTS dictionary_candidates_sentence_idx
  ON dictionary_candidates(generation_id, display_order)
  WHERE source_sentence IS NOT NULL;
