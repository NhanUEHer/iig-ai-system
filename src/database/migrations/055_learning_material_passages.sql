-- Key Vocab and Dictionary share one canonical source passage.
UPDATE key_vocab_generations generation
SET passage_id = passage.id
FROM content_passages passage
WHERE generation.passage_id IS NULL
  AND passage.content_hash = encode(digest(BTRIM(generation.passage), 'sha256'), 'hex');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM key_vocab_generations WHERE passage_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot normalize key_vocab_generations: passage_id backfill is incomplete';
  END IF;
  ALTER TABLE key_vocab_generations ALTER COLUMN passage_id SET NOT NULL;
  ALTER TABLE key_vocab_generations DROP COLUMN IF EXISTS passage;
END $$;

CREATE INDEX IF NOT EXISTS key_vocab_generations_passage_idx
  ON key_vocab_generations(passage_id, created_at DESC);
