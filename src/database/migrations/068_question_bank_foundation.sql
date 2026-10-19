-- Migration 068: Question Bank Database Schema Foundation
-- Creates question_bank_questions, question_bank_options, and question_bank_media tables.

CREATE TABLE IF NOT EXISTS question_bank_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill VARCHAR(24) NOT NULL,
  question_type VARCHAR(40) NOT NULL,
  title VARCHAR(240) NOT NULL,
  content_text TEXT,
  question_text TEXT,
  preparation_seconds INTEGER,
  response_seconds INTEGER,
  max_writing_length INTEGER,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_question_bank_skill CHECK (skill IN ('LISTENING', 'READING', 'SPEAKING', 'WRITING')),
  CONSTRAINT chk_question_bank_status CHECK (status IN ('DRAFT', 'ACTIVE', 'INACTIVE'))
);

CREATE INDEX IF NOT EXISTS idx_question_bank_questions_skill_status
  ON question_bank_questions(skill, status);

CREATE INDEX IF NOT EXISTS idx_question_bank_questions_type
  ON question_bank_questions(question_type);

CREATE INDEX IF NOT EXISTS idx_question_bank_questions_created_by
  ON question_bank_questions(created_by);

CREATE TABLE IF NOT EXISTS question_bank_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES question_bank_questions(id) ON DELETE CASCADE,
  option_key VARCHAR(20) NOT NULL,
  option_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_question_bank_options_key UNIQUE (question_id, option_key)
);

CREATE INDEX IF NOT EXISTS idx_question_bank_options_question_order
  ON question_bank_options(question_id, display_order);

CREATE TABLE IF NOT EXISTS question_bank_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES question_bank_questions(id) ON DELETE CASCADE,
  media_type VARCHAR(20) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  storage_key VARCHAR(500) UNIQUE NOT NULL,
  mime_type VARCHAR(100),
  file_size BIGINT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_question_bank_media_type CHECK (media_type IN ('IMAGE', 'AUDIO', 'VIDEO'))
);

CREATE INDEX IF NOT EXISTS idx_question_bank_media_question_type
  ON question_bank_media(question_id, media_type);

-- Seed permissions for Question Bank module into standard system roles
UPDATE roles
SET permissions = permissions || '["question_bank.view"]'::jsonb
WHERE slug = 'admin' AND NOT permissions ? 'question_bank.view';

UPDATE roles
SET permissions = permissions || '["question_bank.manage"]'::jsonb
WHERE slug = 'admin' AND NOT permissions ? 'question_bank.manage';

UPDATE roles
SET permissions = permissions || '["question_bank.view"]'::jsonb
WHERE slug = 'manager' AND NOT permissions ? 'question_bank.view';
