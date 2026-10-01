ALTER TABLE content_source_analyses
  ADD COLUMN IF NOT EXISTS review_label VARCHAR(24) NOT NULL DEFAULT 'NEEDS_REVIEW',
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE content_source_analyses ADD CONSTRAINT content_analysis_review_label
    CHECK (review_label IN ('APPROVED','NEEDS_REVIEW','REJECTED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS content_source_analysis_review_idx
  ON content_source_analyses(review_label, created_at DESC);

