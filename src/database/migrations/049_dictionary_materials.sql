CREATE TABLE IF NOT EXISTS content_passages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS content_passages_hash_unique ON content_passages(content_hash);

ALTER TABLE key_vocab_generations ADD COLUMN IF NOT EXISTS passage_id UUID REFERENCES content_passages(id);

INSERT INTO content_passages (content, content_hash, created_by, created_at, updated_at)
SELECT DISTINCT ON (encode(digest(BTRIM(passage), 'sha256'), 'hex'))
  passage, encode(digest(BTRIM(passage), 'sha256'), 'hex'), created_by, created_at, updated_at
FROM key_vocab_generations
WHERE passage_id IS NULL
ORDER BY encode(digest(BTRIM(passage), 'sha256'), 'hex'), created_at;

UPDATE key_vocab_generations generation
SET passage_id = passage.id
FROM content_passages passage
WHERE generation.passage_id IS NULL
  AND passage.content_hash = encode(digest(BTRIM(generation.passage), 'sha256'), 'hex');

CREATE TABLE IF NOT EXISTS dictionary_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passage_id UUID NOT NULL REFERENCES content_passages(id),
  status VARCHAR(20) NOT NULL DEFAULT 'completed',
  extraction_workflow_run_id TEXT,
  raw_extraction_response JSONB,
  failed_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT dictionary_generation_status_check CHECK (status IN ('partial', 'completed', 'failed'))
);

CREATE TABLE IF NOT EXISTS dictionary_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES dictionary_generations(id) ON DELETE CASCADE,
  original_chunk TEXT NOT NULL,
  canonical TEXT NOT NULL,
  part_of_speech VARCHAR(32) NOT NULL,
  ipa TEXT,
  meaning_vi TEXT NOT NULL,
  meaning_en TEXT,
  original_sentence TEXT,
  context_explanation TEXT,
  example_en TEXT,
  example_vi TEXT,
  collocations JSONB NOT NULL DEFAULT '[]'::jsonb,
  synonyms JSONB NOT NULL DEFAULT '[]'::jsonb,
  word_family TEXT,
  workflow_run_id TEXT,
  raw_response JSONB,
  display_order SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT dictionary_entry_order_unique UNIQUE (generation_id, display_order)
);

CREATE INDEX IF NOT EXISTS dictionary_generations_passage_idx ON dictionary_generations(passage_id);
CREATE INDEX IF NOT EXISTS dictionary_generations_created_at_idx ON dictionary_generations(created_at DESC);
CREATE INDEX IF NOT EXISTS dictionary_entries_canonical_idx ON dictionary_entries(LOWER(canonical));

UPDATE roles
SET permissions = permissions || '["dictionary.view","dictionary.generate","dictionary.manage"]'::jsonb
WHERE slug = 'admin'
  AND NOT permissions ? 'dictionary.manage';
