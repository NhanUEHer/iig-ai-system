-- Migration 071: Exam Events Database Schema Foundation
-- Creates exam_events table and seeds permissions into system roles.

CREATE TABLE IF NOT EXISTS exam_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(240) NOT NULL,
  description TEXT,
  image_storage_key VARCHAR(500),
  image_mime_type VARCHAR(100),
  image_file_size BIGINT,
  banner_storage_key VARCHAR(500),
  banner_mime_type VARCHAR(100),
  banner_file_size BIGINT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE RESTRICT,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_exam_events_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  CONSTRAINT chk_exam_events_dates CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_exam_events_status
  ON exam_events(status);

CREATE INDEX IF NOT EXISTS idx_exam_events_exam_id
  ON exam_events(exam_id);

CREATE INDEX IF NOT EXISTS idx_exam_events_dates
  ON exam_events(start_at, end_at);

-- Seed permissions for Exam Events module into standard system roles idempotently
UPDATE roles
SET permissions = permissions || '["exam_events.view"]'::jsonb
WHERE slug = 'admin' AND NOT permissions ? 'exam_events.view';

UPDATE roles
SET permissions = permissions || '["exam_events.manage"]'::jsonb
WHERE slug = 'admin' AND NOT permissions ? 'exam_events.manage';

UPDATE roles
SET permissions = permissions || '["exam_events.view"]'::jsonb
WHERE slug = 'manager' AND NOT permissions ? 'exam_events.view';

UPDATE roles
SET permissions = permissions || '["exam_events.manage"]'::jsonb
WHERE slug = 'manager' AND NOT permissions ? 'exam_events.manage';
