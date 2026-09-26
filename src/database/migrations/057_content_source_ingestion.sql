CREATE TABLE IF NOT EXISTS content_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(24) NOT NULL,
  original_filename TEXT,
  mime_type VARCHAR(120),
  file_size BIGINT,
  checksum VARCHAR(64),
  storage_key TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'ready',
  extraction_method VARCHAR(32) NOT NULL,
  extracted_text TEXT NOT NULL DEFAULT '',
  detected_content JSONB NOT NULL DEFAULT '{}',
  usage_metadata JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT content_source_type CHECK (source_type IN ('text','image','pdf')),
  CONSTRAINT content_source_status CHECK (status IN ('ready','failed'))
);

CREATE INDEX IF NOT EXISTS content_sources_created_by_idx
  ON content_sources(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS content_sources_checksum_idx
  ON content_sources(checksum) WHERE checksum IS NOT NULL;

UPDATE roles SET permissions = permissions || '["content_sources.view","content_sources.create"]'::jsonb
WHERE slug = 'admin';
