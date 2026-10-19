-- A passage is a shared source for Key Vocab and Dictionary generations.
-- Earlier databases only have the non-unique content_passages_hash_idx index,
-- while both services rely on ON CONFLICT (content_hash) when reusing it.
CREATE UNIQUE INDEX IF NOT EXISTS content_passages_hash_unique
  ON content_passages(content_hash);
