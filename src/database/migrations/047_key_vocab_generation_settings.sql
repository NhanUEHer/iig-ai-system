ALTER TABLE key_vocab_generations
  ADD COLUMN IF NOT EXISTS target_score SMALLINT NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS selection_mode VARCHAR(32) NOT NULL DEFAULT 'balanced';

ALTER TABLE key_vocab_generations
  DROP CONSTRAINT IF EXISTS key_vocab_target_score_check,
  ADD CONSTRAINT key_vocab_target_score_check
    CHECK (target_score IN (450, 500, 650, 700, 800));

ALTER TABLE key_vocab_generations
  DROP CONSTRAINT IF EXISTS key_vocab_selection_mode_check,
  ADD CONSTRAINT key_vocab_selection_mode_check
    CHECK (selection_mode IN ('phrase_focused', 'balanced', 'single_word_focused'));
