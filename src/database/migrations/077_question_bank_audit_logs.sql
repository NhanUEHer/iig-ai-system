-- Migration 077: Question Bank Audit Logs
-- Creates question_bank_audit_logs table for tracking all changes to Question Bank entities.

CREATE TABLE IF NOT EXISTS question_bank_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES question_bank_questions(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  action_type VARCHAR(50) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  before_state JSONB,
  after_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_qb_audit_logs_question_id
  ON question_bank_audit_logs(question_id, created_at DESC);
