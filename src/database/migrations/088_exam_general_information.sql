ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS score_scale NUMERIC(10,2) NOT NULL DEFAULT 100;

ALTER TABLE exams DROP CONSTRAINT IF EXISTS chk_exams_score_scale;
ALTER TABLE exams
  ADD CONSTRAINT chk_exams_score_scale CHECK (score_scale > 0);
