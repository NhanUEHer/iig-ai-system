ALTER TABLE question_bank_sub_questions
  ADD COLUMN IF NOT EXISTS max_character_count INTEGER,
  ADD COLUMN IF NOT EXISTS min_word_count INTEGER;

UPDATE question_bank_sub_questions
SET min_word_count = max_word_count
WHERE min_word_count IS NULL AND max_word_count IS NOT NULL;

ALTER TABLE question_bank_sub_questions
  DROP CONSTRAINT IF EXISTS question_bank_sub_questions_max_character_count_check,
  DROP CONSTRAINT IF EXISTS question_bank_sub_questions_min_word_count_check;

ALTER TABLE question_bank_sub_questions
  ADD CONSTRAINT question_bank_sub_questions_max_character_count_check
    CHECK (max_character_count IS NULL OR max_character_count > 0),
  ADD CONSTRAINT question_bank_sub_questions_min_word_count_check
    CHECK (min_word_count IS NULL OR min_word_count > 0);
