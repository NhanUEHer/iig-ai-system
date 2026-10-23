-- Forward-compatible replay for databases whose migration history already
-- advanced beyond the feature branch's migration 122. Every statement is
-- idempotent; clean databases may safely run both 122 and 127.
ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS test_type VARCHAR(20) NOT NULL DEFAULT 'TOEIC';

ALTER TABLE exams DROP CONSTRAINT IF EXISTS chk_exams_test_type;
ALTER TABLE exams ADD CONSTRAINT chk_exams_test_type
  CHECK (test_type IN ('TOEIC', 'TOEFL_IBT'));

ALTER TABLE exam_parts
  ADD COLUMN IF NOT EXISTS answer_duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS sub_question_gap_seconds INTEGER NOT NULL DEFAULT 0;

ALTER TABLE exam_parts DROP CONSTRAINT IF EXISTS chk_exam_parts_answer_duration;
ALTER TABLE exam_parts ADD CONSTRAINT chk_exam_parts_answer_duration
  CHECK (answer_duration_seconds IS NULL OR answer_duration_seconds > 0);

ALTER TABLE exam_parts DROP CONSTRAINT IF EXISTS chk_exam_parts_sub_question_gap;
ALTER TABLE exam_parts ADD CONSTRAINT chk_exam_parts_sub_question_gap
  CHECK (sub_question_gap_seconds >= 0);
