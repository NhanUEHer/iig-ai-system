-- Content Studio generated artifacts (one per target + type) with full version history.
CREATE TABLE IF NOT EXISTS cs_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES cs_items(id) ON DELETE CASCADE,
  segment_id UUID REFERENCES cs_segments(id) ON DELETE CASCADE,
  question_id UUID REFERENCES cs_questions(id) ON DELETE CASCADE,
  target_key VARCHAR(80) NOT NULL,
  type VARCHAR(32) NOT NULL CHECK (type IN ('passage_translation','vocab','dictionary','question_pack')),
  status VARCHAR(24) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','generating','needs_review','ready','failed')),
  content JSONB,
  validation JSONB NOT NULL DEFAULT '{"issues":[]}'::jsonb,
  source VARCHAR(16) CHECK (source IN ('ai','human')),
  provider VARCHAR(40),
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (item_id, target_key, type)
);
CREATE INDEX IF NOT EXISTS cs_artifacts_queue_idx ON cs_artifacts(status, updated_at) WHERE status IN ('queued','generating');

CREATE TABLE IF NOT EXISTS cs_artifact_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL REFERENCES cs_artifacts(id) ON DELETE CASCADE,
  content JSONB NOT NULL,
  validation JSONB NOT NULL DEFAULT '{"issues":[]}'::jsonb,
  source VARCHAR(16) NOT NULL CHECK (source IN ('ai','human')),
  provider VARCHAR(40),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS cs_artifact_versions_artifact_idx ON cs_artifact_versions(artifact_id, created_at DESC);
