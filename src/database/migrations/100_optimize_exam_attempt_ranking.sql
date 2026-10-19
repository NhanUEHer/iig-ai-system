ALTER TABLE exam_attempts
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

UPDATE exam_attempts
SET duration_seconds=GREATEST(0,EXTRACT(EPOCH FROM (submitted_at-started_at))::int)
WHERE status='SUBMITTED' AND submitted_at IS NOT NULL AND duration_seconds IS NULL;

CREATE INDEX IF NOT EXISTS idx_exam_attempts_event_ranking
  ON exam_attempts(exam_event_id,status,total_score DESC,duration_seconds ASC,submitted_at ASC,id);
