-- Images attached to a Content Studio item: Part 1 photos (one per question) and
-- Part 3/4 graphics (one per question set). Files live in R2; this row is the link.
CREATE TABLE IF NOT EXISTS cs_item_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES cs_items(id) ON DELETE CASCADE,
  segment_id UUID REFERENCES cs_segments(id) ON DELETE SET NULL,
  question_id UUID REFERENCES cs_questions(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  storage_key TEXT NOT NULL,
  mime VARCHAR(32) NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 CHAR(64) NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cs_item_images_item_idx ON cs_item_images(item_id, position);
