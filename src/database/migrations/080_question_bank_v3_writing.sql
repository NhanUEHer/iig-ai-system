-- Question Bank V3: Writing question type.
ALTER TABLE question_bank_questions DROP CONSTRAINT IF EXISTS chk_qb_v3_type;
ALTER TABLE question_bank_questions ADD CONSTRAINT chk_qb_v3_type
  CHECK (question_type IN ('MCQ_SINGLE', 'RECORD', 'WRITING'));

ALTER TABLE question_bank_sub_questions
  ADD COLUMN IF NOT EXISTS max_word_count INTEGER;

ALTER TABLE question_bank_sub_questions DROP CONSTRAINT IF EXISTS chk_qb_max_word_count;
ALTER TABLE question_bank_sub_questions ADD CONSTRAINT chk_qb_max_word_count
  CHECK (max_word_count IS NULL OR max_word_count > 0);
