-- Retire the legacy exam-event flow. Candidate activity is now scoped directly
-- to an exam. Historical event rows are intentionally removed by product
-- decision; direct candidates and attempts are preserved.

DELETE FROM exam_attempts WHERE exam_event_id IS NOT NULL;
DELETE FROM exam_candidates WHERE exam_event_id IS NOT NULL;

DROP INDEX IF EXISTS uq_exam_attempts_active_candidate_event;
DROP INDEX IF EXISTS idx_exam_attempts_candidate_event;
DROP INDEX IF EXISTS idx_exam_attempts_event_id;
DROP INDEX IF EXISTS idx_exam_attempts_event_status;
DROP INDEX IF EXISTS idx_exam_attempts_event_ranking;
DROP INDEX IF EXISTS idx_exam_attempts_direct_result_rank;
DROP INDEX IF EXISTS idx_exam_attempts_direct_client_session;
DROP INDEX IF EXISTS uq_exam_attempts_active_candidate_exam_direct;

DROP INDEX IF EXISTS idx_exam_candidates_event_id;
DROP INDEX IF EXISTS idx_exam_candidates_event_email;
DROP INDEX IF EXISTS idx_exam_candidates_event_phone;
DROP INDEX IF EXISTS uq_exam_candidates_event_number;
DROP INDEX IF EXISTS idx_exam_candidates_event_toeic;

ALTER TABLE exam_attempts DROP COLUMN IF EXISTS exam_event_id;
ALTER TABLE exam_candidates DROP COLUMN IF EXISTS exam_event_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_candidates_candidate_number
  ON exam_candidates(candidate_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_attempts_active_candidate_exam
  ON exam_attempts(candidate_id,exam_id)
  WHERE status='IN_PROGRESS';
CREATE INDEX IF NOT EXISTS idx_exam_attempts_result_rank
  ON exam_attempts(exam_id,total_score DESC,duration_seconds ASC,submitted_at ASC,id ASC)
  WHERE status='SUBMITTED';
CREATE INDEX IF NOT EXISTS idx_exam_attempts_client_session
  ON exam_attempts(candidate_id,exam_id,client_session_id)
  WHERE status='IN_PROGRESS';

DROP TABLE IF EXISTS exam_event_school_assignments;
DROP TABLE IF EXISTS exam_events;
DROP TABLE IF EXISTS exam_event_schools;

UPDATE roles
SET permissions=(permissions - 'exam_events.view' - 'exam_events.manage')
WHERE permissions ? 'exam_events.view' OR permissions ? 'exam_events.manage';
