CREATE TABLE IF NOT EXISTS grading_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  total_items INT NOT NULL DEFAULT 0,
  completed_items INT NOT NULL DEFAULT 0,
  failed_items INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS grading_job_items (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES grading_jobs(id) ON DELETE CASCADE,
  submission_id VARCHAR(36) NOT NULL REFERENCES mocktest_submissions(id) ON DELETE CASCADE,
  answer_id VARCHAR(100) NOT NULL REFERENCES submission_answers(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  final_score DECIMAL(5,2),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(job_id, answer_id)
);

CREATE INDEX IF NOT EXISTS grading_job_items_job_idx ON grading_job_items(job_id, status);
