ALTER TABLE exam_parts
  ADD COLUMN IF NOT EXISTS configured_duration_seconds INTEGER NOT NULL DEFAULT 0;

UPDATE exam_parts
SET configured_duration_seconds = duration_minutes * 60
WHERE configured_duration_seconds = 0
  AND duration_minutes > 0;

ALTER TABLE exam_parts
  DROP CONSTRAINT IF EXISTS chk_exam_parts_configured_duration;

ALTER TABLE exam_parts
  ADD CONSTRAINT chk_exam_parts_configured_duration
  CHECK (configured_duration_seconds >= 0);

COMMENT ON COLUMN exam_parts.configured_duration_seconds IS
  'Configured working time for modes whose duration is defined per Part, currently Writing.';
