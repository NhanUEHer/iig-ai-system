-- Persist section-level completion independently from question and submission state.
-- This table existed in the standalone scoring backend before plan-driven
-- completion, but was missing from the Admin repository migration sequence.

CREATE TABLE IF NOT EXISTS iig_ai_section_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES iig_submissions(id) ON DELETE CASCADE,
  section_type VARCHAR(20) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_iig_ai_section_statuses_submission UNIQUE (submission_id, section_type),
  CONSTRAINT chk_iig_ai_section_statuses_type CHECK (section_type IN ('SPEAKING', 'WRITING')),
  CONSTRAINT chk_iig_ai_section_statuses_status CHECK (status IN (
    'PENDING', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ISSUES', 'FAILED'
  )),
  CONSTRAINT chk_iig_ai_section_statuses_completion CHECK (
    completed_at IS NULL OR status IN ('COMPLETED', 'COMPLETED_WITH_ISSUES', 'FAILED')
  )
);

CREATE INDEX IF NOT EXISTS idx_iig_ai_section_statuses_status
  ON iig_ai_section_statuses(section_type, status, updated_at DESC);
