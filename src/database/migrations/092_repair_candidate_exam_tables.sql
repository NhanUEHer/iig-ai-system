-- Repair environments where migration 073 was registered without its tables.
CREATE TABLE IF NOT EXISTS exam_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_event_id UUID NOT NULL REFERENCES exam_events(id) ON DELETE RESTRICT,
  full_name VARCHAR(240) NOT NULL,
  email VARCHAR(240), phone VARCHAR(50), school_name VARCHAR(240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_exam_candidates_event_id ON exam_candidates(exam_event_id);
CREATE INDEX IF NOT EXISTS idx_exam_candidates_email ON exam_candidates(email);
CREATE INDEX IF NOT EXISTS idx_exam_candidates_phone ON exam_candidates(phone);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_event_id UUID NOT NULL REFERENCES exam_events(id) ON DELETE RESTRICT,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE RESTRICT,
  candidate_id UUID NOT NULL REFERENCES exam_candidates(id) ON DELETE CASCADE,
  status VARCHAR(24) NOT NULL DEFAULT 'IN_PROGRESS',
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL, submitted_at TIMESTAMPTZ,
  total_score NUMERIC(10,2), question_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_exam_attempts_status CHECK (status IN ('IN_PROGRESS','SUBMITTED','EXPIRED','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_candidate_event ON exam_attempts(candidate_id,exam_event_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_event_id ON exam_attempts(exam_event_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_status ON exam_attempts(status);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_expires_at ON exam_attempts(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_attempts_active_candidate_event ON exam_attempts(candidate_id,exam_event_id) WHERE status='IN_PROGRESS';

CREATE TABLE IF NOT EXISTS exam_attempt_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES question_bank_questions(id) ON DELETE RESTRICT,
  selected_option VARCHAR(20), text_answer TEXT, audio_storage_key VARCHAR(500),
  score NUMERIC(10,2), answered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_exam_attempt_answers_attempt_question UNIQUE(attempt_id,question_id)
);
CREATE INDEX IF NOT EXISTS idx_exam_attempt_answers_attempt_id ON exam_attempt_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempt_answers_question_id ON exam_attempt_answers(question_id);
