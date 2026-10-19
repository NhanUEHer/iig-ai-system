ALTER TABLE exam_attempt_answers
  ADD COLUMN IF NOT EXISTS is_correct BOOLEAN;

ALTER TABLE exam_attempts
  ADD COLUMN IF NOT EXISTS total_questions INTEGER,
  ADD COLUMN IF NOT EXISTS answered_count INTEGER,
  ADD COLUMN IF NOT EXISTS unanswered_count INTEGER,
  ADD COLUMN IF NOT EXISTS correct_count INTEGER,
  ADD COLUMN IF NOT EXISTS incorrect_count INTEGER,
  ADD COLUMN IF NOT EXISTS score_range_min NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS score_range_max NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS max_score NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scoring_version VARCHAR(40);

CREATE TABLE IF NOT EXISTS exam_attempt_section_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  section_id UUID NOT NULL,
  section_title VARCHAR(150) NOT NULL,
  exam_mode VARCHAR(32) NOT NULL,
  score_scale_id UUID NOT NULL,
  score_scale_code VARCHAR(80) NOT NULL,
  score_scale_version INTEGER NOT NULL DEFAULT 1,
  total_questions INTEGER NOT NULL,
  answered_count INTEGER NOT NULL,
  unanswered_count INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  incorrect_count INTEGER NOT NULL,
  exact_score NUMERIC(10,2) NOT NULL,
  score_range_min NUMERIC(10,2) NOT NULL,
  score_range_max NUMERIC(10,2) NOT NULL,
  min_possible_score NUMERIC(10,2) NOT NULL,
  max_possible_score NUMERIC(10,2) NOT NULL,
  scoring_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_exam_attempt_section_score UNIQUE (attempt_id, section_id),
  CONSTRAINT chk_attempt_section_counts CHECK (
    total_questions >= 0 AND answered_count >= 0 AND unanswered_count >= 0
    AND correct_count >= 0 AND incorrect_count >= 0
    AND answered_count + unanswered_count = total_questions
    AND correct_count + incorrect_count = answered_count
  ),
  CONSTRAINT chk_attempt_section_score_range CHECK (
    exact_score >= min_possible_score AND exact_score <= max_possible_score
    AND score_range_min = exact_score
    AND score_range_max >= score_range_min AND score_range_max <= max_possible_score
  )
);

CREATE INDEX IF NOT EXISTS idx_attempt_section_scores_attempt
  ON exam_attempt_section_scores(attempt_id);
CREATE INDEX IF NOT EXISTS idx_attempt_section_scores_scale
  ON exam_attempt_section_scores(score_scale_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam_submitted
  ON exam_attempts(exam_id,status,submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_candidate_exam_submitted
  ON exam_attempts(candidate_id,exam_id,submitted_at DESC);
