-- Question Bank V3: Record question type.
ALTER TABLE question_bank_questions DROP CONSTRAINT IF EXISTS chk_qb_v3_type;
ALTER TABLE question_bank_questions ADD CONSTRAINT chk_qb_v3_type
  CHECK (question_type IN ('MCQ_SINGLE', 'RECORD'));

ALTER TABLE question_bank_sub_questions
  ADD COLUMN IF NOT EXISTS instruction_html TEXT,
  ADD COLUMN IF NOT EXISTS sentence_starters_html TEXT,
  ADD COLUMN IF NOT EXISTS recording_duration_seconds INTEGER;

ALTER TABLE question_bank_sub_questions DROP CONSTRAINT IF EXISTS chk_qb_recording_duration;
ALTER TABLE question_bank_sub_questions ADD CONSTRAINT chk_qb_recording_duration
  CHECK (recording_duration_seconds IS NULL OR recording_duration_seconds > 0);

CREATE TABLE IF NOT EXISTS question_bank_sample_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_question_id UUID NOT NULL REFERENCES question_bank_sub_questions(id) ON DELETE CASCADE,
  answer_html TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE question_bank_media
  ADD COLUMN IF NOT EXISTS sample_answer_id UUID REFERENCES question_bank_sample_answers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS media_role VARCHAR(32);

ALTER TABLE question_bank_media DROP CONSTRAINT IF EXISTS chk_qb_v3_media_target;
ALTER TABLE question_bank_media ADD CONSTRAINT chk_qb_v3_media_target CHECK (
  (content_id IS NOT NULL AND sub_question_id IS NULL AND sample_answer_id IS NULL) OR
  (content_id IS NULL AND sub_question_id IS NOT NULL AND sample_answer_id IS NULL) OR
  (content_id IS NULL AND sub_question_id IS NULL AND sample_answer_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_qb_sample_answers_order
  ON question_bank_sample_answers(sub_question_id, display_order);
CREATE INDEX IF NOT EXISTS idx_qb_media_sample_answer
  ON question_bank_media(sample_answer_id);
