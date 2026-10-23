-- TOEFL Reading "Complete the Words" question type.
ALTER TABLE question_bank_questions DROP CONSTRAINT IF EXISTS chk_qb_v3_type;
ALTER TABLE question_bank_questions ADD CONSTRAINT chk_qb_v3_type
  CHECK (question_type IN ('MCQ_SINGLE', 'RECORD', 'WRITING', 'COMPLETE_WORDS'));

ALTER TABLE question_bank_questions
  ADD COLUMN IF NOT EXISTS stem_html TEXT;

ALTER TABLE question_bank_sub_questions
  ADD COLUMN IF NOT EXISTS gap_index INTEGER,
  ADD COLUMN IF NOT EXISTS correct_text TEXT,
  ADD COLUMN IF NOT EXISTS case_sensitive BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE question_bank_sub_questions DROP CONSTRAINT IF EXISTS chk_qb_gap_index;
ALTER TABLE question_bank_sub_questions ADD CONSTRAINT chk_qb_gap_index
  CHECK (gap_index IS NULL OR gap_index > 0);

ALTER TABLE question_bank_sub_questions DROP CONSTRAINT IF EXISTS chk_qb_correct_text;
ALTER TABLE question_bank_sub_questions ADD CONSTRAINT chk_qb_correct_text
  CHECK (correct_text IS NULL OR BTRIM(correct_text) <> '');

CREATE UNIQUE INDEX IF NOT EXISTS uq_qb_sub_question_gap_index
  ON question_bank_sub_questions(question_id, gap_index)
  WHERE gap_index IS NOT NULL;

ALTER TABLE exam_attempt_answers
  ADD COLUMN IF NOT EXISTS text_answer TEXT;
