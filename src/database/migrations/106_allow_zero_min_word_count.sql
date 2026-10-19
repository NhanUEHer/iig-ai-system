-- A Writing question may intentionally have no minimum-word requirement.
-- Keep the database constraint aligned with the API validation and UI default.
ALTER TABLE question_bank_sub_questions
  DROP CONSTRAINT IF EXISTS question_bank_sub_questions_min_word_count_check;

ALTER TABLE question_bank_sub_questions
  ADD CONSTRAINT question_bank_sub_questions_min_word_count_check
    CHECK (min_word_count IS NULL OR min_word_count >= 0);
