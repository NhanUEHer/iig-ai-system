ALTER TABLE key_vocab_items
  ADD COLUMN IF NOT EXISTS original_term TEXT;

UPDATE key_vocab_items
SET original_term = term
WHERE original_term IS NULL OR BTRIM(original_term) = '';

ALTER TABLE key_vocab_items
  ALTER COLUMN original_term SET NOT NULL;

COMMENT ON COLUMN key_vocab_items.original_term IS
  'Exact source form as it appeared in the passage; used for reliable passage highlighting.';
