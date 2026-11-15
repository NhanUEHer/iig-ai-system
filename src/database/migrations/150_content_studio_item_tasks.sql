-- Generation tasks requested for a Content Studio item, e.g.
-- {"passage": ["translation","vocab","dictionary"], "question": ["translation","hint","explanation","note"]}
ALTER TABLE cs_items ADD COLUMN IF NOT EXISTS tasks JSONB NOT NULL DEFAULT '{}'::jsonb;
