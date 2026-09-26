-- Trace the immutable exam version used by a candidate and audio readiness.
ALTER TABLE exam_attempts
  ADD COLUMN IF NOT EXISTS exam_version_id UUID REFERENCES exam_versions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS audio_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam_version
  ON exam_attempts(exam_version_id);
