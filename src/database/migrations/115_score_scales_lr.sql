-- LR raw-correct score scales. The scale rows are immutable once referenced by
-- an exam section; updates are intended for DRAFT scales only.
CREATE TABLE IF NOT EXISTS score_scales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  scale_type VARCHAR(32) NOT NULL DEFAULT 'LR_RAW_CORRECT',
  question_count INTEGER NOT NULL,
  min_score NUMERIC(10,2) NOT NULL,
  max_score NUMERIC(10,2) NOT NULL,
  score_step NUMERIC(10,2) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_score_scales_type CHECK (scale_type = 'LR_RAW_CORRECT'),
  CONSTRAINT chk_score_scales_status CHECK (status IN ('DRAFT','ACTIVE','INACTIVE')),
  CONSTRAINT chk_score_scales_question_count CHECK (question_count > 0),
  CONSTRAINT chk_score_scales_range CHECK (min_score <= max_score),
  CONSTRAINT chk_score_scales_step CHECK (score_step > 0)
);

CREATE TABLE IF NOT EXISTS score_scale_raw_ranges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  score_scale_id UUID NOT NULL REFERENCES score_scales(id) ON DELETE CASCADE,
  correct_count INTEGER NOT NULL,
  converted_score NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_score_scale_raw_count UNIQUE (score_scale_id, correct_count),
  CONSTRAINT chk_score_scale_raw_count CHECK (correct_count >= 0),
  CONSTRAINT chk_score_scale_raw_score CHECK (converted_score >= 0)
);

CREATE INDEX IF NOT EXISTS idx_score_scales_type_status
  ON score_scales(scale_type, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_score_scale_raw_ranges_scale_count
  ON score_scale_raw_ranges(score_scale_id, correct_count);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_exam_sections_score_scale'
  ) THEN
    ALTER TABLE exam_sections
      ADD CONSTRAINT fk_exam_sections_score_scale
      FOREIGN KEY (score_scale_id) REFERENCES score_scales(id);
  END IF;
END $$;
