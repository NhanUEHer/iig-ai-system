ALTER TABLE content_trends
  ADD COLUMN IF NOT EXISTS is_selected BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE content_trends
SET is_selected = TRUE
WHERE is_active = TRUE AND verification_status = 'CONFIRMED';

CREATE INDEX IF NOT EXISTS content_trends_selected_idx
  ON content_trends(created_by, is_active, is_selected);
