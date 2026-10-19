CREATE TABLE IF NOT EXISTS key_vocab_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passage TEXT NOT NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'ai_academy',
  workflow_run_id TEXT,
  raw_response JSONB,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS key_vocab_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES key_vocab_generations(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  part_of_speech VARCHAR(32) NOT NULL,
  pronunciation TEXT NOT NULL,
  meaning_vi TEXT NOT NULL,
  display_order SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT key_vocab_item_order_unique UNIQUE (generation_id, display_order)
);

CREATE INDEX IF NOT EXISTS key_vocab_generations_created_at_idx ON key_vocab_generations(created_at DESC);
CREATE INDEX IF NOT EXISTS key_vocab_generations_created_by_idx ON key_vocab_generations(created_by);

UPDATE roles
SET permissions = permissions || '["key_vocab.view","key_vocab.generate","key_vocab.manage"]'::jsonb
WHERE slug = 'admin';
