-- Content Studio two-step dictionary. The legacy cs_artifacts dictionary rows remain
-- readable for compatibility, but new dictionary work is stored only in these tables.

CREATE TABLE IF NOT EXISTS cs_dict_sentences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES cs_items(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES cs_segments(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('draft','queued','generating','ready','needs_review','failed')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (item_id, position)
);
CREATE INDEX IF NOT EXISTS cs_dict_sentences_item_idx
  ON cs_dict_sentences(item_id, position);
CREATE INDEX IF NOT EXISTS cs_dict_sentences_queue_idx
  ON cs_dict_sentences(status, updated_at)
  WHERE status IN ('queued','generating');

CREATE TABLE IF NOT EXISTS cs_dict_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES cs_items(id) ON DELETE CASCADE,
  sentence_id UUID NOT NULL REFERENCES cs_dict_sentences(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  chunk TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','queued','generating','ready','needs_review','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cs_dict_candidates_sentence_idx
  ON cs_dict_candidates(sentence_id, position);
CREATE INDEX IF NOT EXISTS cs_dict_candidates_queue_idx
  ON cs_dict_candidates(status, locked_at, updated_at)
  WHERE status IN ('queued','generating');

CREATE TABLE IF NOT EXISTS cs_dict_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL UNIQUE REFERENCES cs_dict_candidates(id) ON DELETE CASCADE,
  content JSONB NOT NULL,
  validation JSONB NOT NULL DEFAULT '{"issues":[]}'::jsonb,
  source VARCHAR(16) NOT NULL CHECK (source IN ('ai','human')),
  provider VARCHAR(40),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cs_dict_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES cs_dict_candidates(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL,
  request JSONB NOT NULL,
  response JSONB,
  error TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (candidate_id, attempt)
);
CREATE INDEX IF NOT EXISTS cs_dict_attempts_candidate_idx
  ON cs_dict_attempts(candidate_id, attempt DESC);
