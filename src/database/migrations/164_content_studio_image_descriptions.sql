-- One generated description per attached image (cs.image.describe), queued with the
-- other artifacts so it runs in the background before the question packs that use it.
ALTER TABLE cs_artifacts DROP CONSTRAINT IF EXISTS cs_artifacts_type_check;
ALTER TABLE cs_artifacts ADD CONSTRAINT cs_artifacts_type_check
  CHECK (type IN ('passage_translation','vocab','dictionary','question_pack','image_description'));
ALTER TABLE cs_artifacts ADD COLUMN IF NOT EXISTS image_id UUID REFERENCES cs_item_images(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS cs_artifacts_image_idx ON cs_artifacts(image_id) WHERE image_id IS NOT NULL;
