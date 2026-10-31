-- Some long-lived installations retained the legacy passage column after
-- switching Key Vocab generations to the canonical content_passages relation.
-- The application writes passage_id; keep the legacy data readable without
-- requiring new rows to duplicate the passage text.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'key_vocab_generations'
      AND column_name = 'passage'
  ) THEN
    ALTER TABLE key_vocab_generations ALTER COLUMN passage DROP NOT NULL;
  END IF;
END $$;
