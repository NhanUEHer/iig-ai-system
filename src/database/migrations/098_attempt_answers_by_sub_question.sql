ALTER TABLE exam_attempt_answers
  ADD COLUMN IF NOT EXISTS sub_question_id UUID REFERENCES question_bank_sub_questions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE exam_attempt_answers
  DROP CONSTRAINT IF EXISTS uq_exam_attempt_answers_attempt_question;

CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_attempt_answers_attempt_sub_question
  ON exam_attempt_answers(attempt_id, sub_question_id)
  WHERE sub_question_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_attempt_answers_legacy_parent
  ON exam_attempt_answers(attempt_id, question_id)
  WHERE sub_question_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_exam_attempt_answers_sub_question_id
  ON exam_attempt_answers(sub_question_id);
