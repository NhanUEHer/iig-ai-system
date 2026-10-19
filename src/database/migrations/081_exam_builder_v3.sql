-- Exam builder V3: parent-question selection, child-based scoring and immutable versions.
CREATE TABLE IF NOT EXISTS exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(240) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','INACTIVE')),
  duration_minutes INTEGER NOT NULL DEFAULT 0 CHECK (duration_minutes >= 0),
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0 AND duration_seconds <= 59),
  points_per_question INTEGER NOT NULL DEFAULT 10 CHECK (points_per_question = 10),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exam_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL,
  title VARCHAR(240) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (exam_id, part_number)
);

CREATE TABLE IF NOT EXISTS exam_part_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES exam_parts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES question_bank_questions(id) ON DELETE RESTRICT,
  display_order INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 10 CHECK (points = 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (part_id, question_id)
);

ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS active_version_id UUID,
  ADD COLUMN IF NOT EXISTS lock_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE exam_part_questions
  ADD COLUMN IF NOT EXISTS exam_id UUID REFERENCES exams(id) ON DELETE CASCADE;

UPDATE exam_part_questions epq
SET exam_id = ep.exam_id
FROM exam_parts ep
WHERE ep.id = epq.part_id AND epq.exam_id IS NULL;

ALTER TABLE exam_part_questions DROP CONSTRAINT IF EXISTS exam_part_questions_sub_question_id_fkey;
DROP INDEX IF EXISTS idx_exam_part_questions_sub_question_id;
ALTER TABLE exam_part_questions DROP COLUMN IF EXISTS sub_question_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_parent_question
  ON exam_part_questions(exam_id, question_id);
CREATE INDEX IF NOT EXISTS idx_exam_part_questions_exam
  ON exam_part_questions(exam_id);

CREATE TABLE IF NOT EXISTS exam_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  total_parent_questions INTEGER NOT NULL,
  total_sub_questions INTEGER NOT NULL,
  total_points NUMERIC(12,2) NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (exam_id, version_number)
);

DO $$ BEGIN
  ALTER TABLE exams ADD CONSTRAINT exams_active_version_fk
    FOREIGN KEY (active_version_id) REFERENCES exam_versions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_exam_versions_exam
  ON exam_versions(exam_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_exams_status ON exams(status);
CREATE INDEX IF NOT EXISTS idx_exam_parts_exam_order ON exam_parts(exam_id,display_order);
CREATE INDEX IF NOT EXISTS idx_exam_part_questions_part_order ON exam_part_questions(part_id,display_order);

UPDATE roles SET permissions=permissions || '["exams.view","exams.manage"]'::jsonb
WHERE slug IN ('admin','manager');
