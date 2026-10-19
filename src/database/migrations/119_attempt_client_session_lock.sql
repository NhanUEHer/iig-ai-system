-- Prevent one in-progress direct attempt from being resumed in another browser
-- or device. The browser owns a stable opaque UUID; no device fingerprint or
-- personal information is persisted.
ALTER TABLE exam_attempts
  ADD COLUMN IF NOT EXISTS client_session_id UUID;

CREATE INDEX IF NOT EXISTS idx_exam_attempts_direct_client_session
  ON exam_attempts(candidate_id,exam_id,client_session_id)
  WHERE exam_event_id IS NULL AND status='IN_PROGRESS';
