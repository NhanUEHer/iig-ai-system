CREATE TABLE IF NOT EXISTS content_source_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES content_sources(id) ON DELETE CASCADE,
  source_text TEXT NOT NULL,
  source_text_hash VARCHAR(64) NOT NULL,
  model VARCHAR(120) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'completed',
  analysis JSONB NOT NULL DEFAULT '{}',
  validation_metadata JSONB NOT NULL DEFAULT '{}',
  usage_metadata JSONB NOT NULL DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT content_source_analysis_status CHECK (status IN ('completed','failed'))
);

CREATE INDEX IF NOT EXISTS content_source_analyses_source_idx
  ON content_source_analyses(source_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS content_source_analysis_version_idx
  ON content_source_analyses(source_id, source_text_hash) WHERE status='completed';

UPDATE roles SET permissions = permissions || '["content_sources.analyze"]'::jsonb
WHERE slug = 'admin';
