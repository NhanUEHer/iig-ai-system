CREATE TABLE IF NOT EXISTS exam_attempt_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES question_bank_questions(id) ON DELETE RESTRICT,
  sub_question_id UUID NOT NULL REFERENCES question_bank_sub_questions(id) ON DELETE RESTRICT,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type VARCHAR(120) NOT NULL,
  file_size BIGINT,
  duration_seconds NUMERIC(10,3),
  checksum VARCHAR(128),
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  attempt_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  uploaded_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_attempt_recording_status CHECK (status IN ('PENDING','UPLOADED','ACTIVE','REPLACED','DELETED','FAILED')),
  CONSTRAINT chk_attempt_recording_size CHECK (file_size IS NULL OR file_size >= 0),
  CONSTRAINT chk_attempt_recording_duration CHECK (duration_seconds IS NULL OR duration_seconds >= 0)
);

CREATE INDEX IF NOT EXISTS idx_attempt_recordings_attempt_question
  ON exam_attempt_recordings(attempt_id, sub_question_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_attempt_recordings_active_question
  ON exam_attempt_recordings(attempt_id, sub_question_id)
  WHERE status = 'ACTIVE' AND deleted_at IS NULL;
