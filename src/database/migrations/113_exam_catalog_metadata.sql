ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS display_label VARCHAR(80),
  ADD COLUMN IF NOT EXISTS difficulty VARCHAR(24),
  ADD COLUMN IF NOT EXISTS card_image_storage_key VARCHAR(600),
  ADD COLUMN IF NOT EXISTS card_image_mime_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS card_image_file_size BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exams_difficulty_check') THEN
    ALTER TABLE exams ADD CONSTRAINT exams_difficulty_check
      CHECK (difficulty IS NULL OR difficulty IN ('BASIC', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS exam_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  normalized_name VARCHAR(120) NOT NULL UNIQUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exam_group_assignments (
  exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES exam_groups(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (exam_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_group_assignments_group
  ON exam_group_assignments(group_id, exam_id);

INSERT INTO exam_groups(name, normalized_name)
VALUES
  ('Đề thi đầy đủ', 'đề thi đầy đủ'),
  ('Listening', 'listening'),
  ('Reading', 'reading'),
  ('Speaking', 'speaking'),
  ('Writing', 'writing'),
  ('Đề luyện tập', 'đề luyện tập')
ON CONFLICT (normalized_name) DO NOTHING;
