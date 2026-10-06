-- Allow public candidates and attempts to exist independently from exam events.
-- Legacy event-based rows remain valid and keep their original foreign keys.
ALTER TABLE exam_candidates ALTER COLUMN exam_event_id DROP NOT NULL;
ALTER TABLE exam_attempts ALTER COLUMN exam_event_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exam_candidates_normalized_email
  ON exam_candidates(LOWER(BTRIM(email))) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exam_candidates_normalized_phone
  ON exam_candidates(REGEXP_REPLACE(phone, '[ .-]', '', 'g')) WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_attempts_active_candidate_exam_direct
  ON exam_attempts(candidate_id, exam_id)
  WHERE status='IN_PROGRESS' AND exam_event_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_exam_attempts_candidate_exam
  ON exam_attempts(candidate_id, exam_id, started_at DESC);
