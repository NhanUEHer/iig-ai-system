ALTER TABLE question_bank_sub_questions
  ADD COLUMN IF NOT EXISTS preparation_duration_seconds INTEGER;

ALTER TABLE question_bank_sub_questions
  DROP CONSTRAINT IF EXISTS question_bank_sub_questions_preparation_duration_check;

ALTER TABLE question_bank_sub_questions
  ADD CONSTRAINT question_bank_sub_questions_preparation_duration_check
  CHECK (preparation_duration_seconds IS NULL OR preparation_duration_seconds > 0);
