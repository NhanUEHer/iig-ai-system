-- Cover the direct-exam leaderboard order used by the public result API.
CREATE INDEX IF NOT EXISTS idx_exam_attempts_direct_result_rank
  ON exam_attempts(exam_id,total_score DESC,duration_seconds ASC,submitted_at ASC,id ASC)
  WHERE exam_event_id IS NULL AND status='SUBMITTED';
