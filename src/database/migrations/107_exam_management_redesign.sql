-- Exam Management redesign (docs/exam-management-redesign-spec.md).
--
-- Introduces the Section layer between exams and parts, exam type support, Part
-- content fields (instruction HTML / instruction audio / break duration), a
-- single current published snapshot on the exam, and audio-duration metadata on
-- question media. All statements are idempotent and non-destructive so the
-- migration is safe to replay and safe on databases that already contain the
-- legacy exam builder rows.
--
-- Actual durations (question/part/section/exam) are always computed at read
-- time and are intentionally NOT stored here.

-- 1. Exam type + single published snapshot ----------------------------------
ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS exam_type VARCHAR(32),
  ADD COLUMN IF NOT EXISTS published_snapshot JSONB;

-- Legacy exams keep exam_type NULL; their type must be classified manually.
ALTER TABLE exams DROP CONSTRAINT IF EXISTS chk_exams_exam_type;
ALTER TABLE exams ADD CONSTRAINT chk_exams_exam_type CHECK (
  exam_type IS NULL OR exam_type IN (
    'LISTENING_READING', 'READING', 'LISTENING', 'SPEAKING_WRITING', 'SPEAKING', 'WRITING'
  )
);

-- 2. Exam sections -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS exam_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  exam_mode VARCHAR(32) NOT NULL,
  question_count INTEGER NOT NULL,
  configured_duration_seconds INTEGER NOT NULL,
  score_scale_id UUID,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_exam_sections_mode CHECK (exam_mode IN ('FREESTYLE', 'NON_STOP', 'RECORD_NON_STOP', 'WRITING_NON_STOP')),
  CONSTRAINT chk_exam_sections_question_count CHECK (question_count > 0),
  CONSTRAINT chk_exam_sections_duration CHECK (configured_duration_seconds > 0),
  CONSTRAINT uq_exam_sections_order UNIQUE (exam_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_exam_sections_exam_order
  ON exam_sections(exam_id, sort_order);

-- 3. Part ownership + content fields ----------------------------------------
ALTER TABLE exam_parts
  ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES exam_sections(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS instruction_html TEXT,
  ADD COLUMN IF NOT EXISTS instruction_audio_media_id UUID REFERENCES question_bank_media(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS break_duration_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- Seed sort_order from the legacy display_order so existing parts keep order.
UPDATE exam_parts SET sort_order = display_order WHERE sort_order IS NULL;

ALTER TABLE exam_parts DROP CONSTRAINT IF EXISTS chk_exam_parts_break_duration;
ALTER TABLE exam_parts ADD CONSTRAINT chk_exam_parts_break_duration CHECK (break_duration_seconds >= 0);

CREATE INDEX IF NOT EXISTS idx_exam_parts_section_order
  ON exam_parts(section_id, sort_order);

-- 4. Media audio-duration metadata ------------------------------------------
-- Duration is captured from backend media metadata and is the only source the
-- dynamic duration calculator trusts.
ALTER TABLE question_bank_media
  ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC;
