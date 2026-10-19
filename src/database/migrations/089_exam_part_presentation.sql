ALTER TABLE exam_parts
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS part_label VARCHAR(120),
  ADD COLUMN IF NOT EXISTS instruction TEXT;

ALTER TABLE exam_parts DROP CONSTRAINT IF EXISTS chk_exam_parts_duration_minutes;
ALTER TABLE exam_parts ADD CONSTRAINT chk_exam_parts_duration_minutes CHECK (duration_minutes >= 0);
