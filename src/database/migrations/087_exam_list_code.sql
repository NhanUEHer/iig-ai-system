ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS exam_code VARCHAR(32);

UPDATE exams
SET exam_code = 'EX-' || UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 8))
WHERE exam_code IS NULL OR BTRIM(exam_code) = '';

ALTER TABLE exams
  ALTER COLUMN exam_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_exams_exam_code
  ON exams (exam_code);

CREATE INDEX IF NOT EXISTS idx_exams_status_updated_at
  ON exams (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_exams_title_search
  ON exams (LOWER(title));
