-- Persist the compact per-part result projection produced at submit time.
-- Result pages can therefore load without rescanning every submitted answer.
ALTER TABLE exam_attempts
  ADD COLUMN IF NOT EXISTS part_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE exam_attempts
  DROP CONSTRAINT IF EXISTS chk_exam_attempts_part_breakdown_array;

ALTER TABLE exam_attempts
  ADD CONSTRAINT chk_exam_attempts_part_breakdown_array
  CHECK (jsonb_typeof(part_breakdown) = 'array');
