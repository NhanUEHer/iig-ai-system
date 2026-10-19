-- Migration 074: Candidate and attempt lookup index optimizations
-- Adds composite indexes for event + email/phone lookup and status filtering on attempts.

CREATE INDEX IF NOT EXISTS idx_exam_candidates_event_email
  ON exam_candidates(exam_event_id, email);

CREATE INDEX IF NOT EXISTS idx_exam_candidates_event_phone
  ON exam_candidates(exam_event_id, phone);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_event_status
  ON exam_attempts(exam_event_id, status);
