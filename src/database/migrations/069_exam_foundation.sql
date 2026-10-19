-- Migration 069: Exam Management Database Schema Foundation
-- Creates exams, exam_parts, and exam_part_questions tables along with roles permission updates.

CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(240) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  points_per_question INTEGER NOT NULL DEFAULT 10,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_exams_status CHECK (status IN ('DRAFT', 'ACTIVE', 'INACTIVE')),
  CONSTRAINT chk_exams_duration_minutes CHECK (duration_minutes >= 0),
  CONSTRAINT chk_exams_duration_seconds CHECK (duration_seconds >= 0 AND duration_seconds <= 59),
  CONSTRAINT chk_exams_points_per_question CHECK (points_per_question = 10)
);

CREATE INDEX IF NOT EXISTS idx_exams_status
  ON exams(status);

CREATE TABLE IF NOT EXISTS exam_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL,
  title VARCHAR(240),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_exam_parts_exam_part_number UNIQUE (exam_id, part_number)
);

CREATE INDEX IF NOT EXISTS idx_exam_parts_exam_order
  ON exam_parts(exam_id, display_order);

CREATE TABLE IF NOT EXISTS exam_part_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES exam_parts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES question_bank_questions(id),
  display_order INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_exam_part_questions_part_question UNIQUE (part_id, question_id),
  CONSTRAINT chk_exam_part_questions_points CHECK (points = 10)
);

CREATE INDEX IF NOT EXISTS idx_exam_part_questions_part_order
  ON exam_part_questions(part_id, display_order);

-- Seed permissions for Exams module into standard system roles idempotently
UPDATE roles
SET permissions = permissions || '["exams.view"]'::jsonb
WHERE slug = 'admin' AND NOT permissions ? 'exams.view';

UPDATE roles
SET permissions = permissions || '["exams.manage"]'::jsonb
WHERE slug = 'admin' AND NOT permissions ? 'exams.manage';

UPDATE roles
SET permissions = permissions || '["exams.view"]'::jsonb
WHERE slug = 'manager' AND NOT permissions ? 'exams.view';

UPDATE roles
SET permissions = permissions || '["exams.manage"]'::jsonb
WHERE slug = 'manager' AND NOT permissions ? 'exams.manage';
