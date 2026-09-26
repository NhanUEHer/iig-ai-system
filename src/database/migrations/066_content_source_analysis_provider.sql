ALTER TABLE content_source_analyses
  ADD COLUMN IF NOT EXISTS schema_version VARCHAR(64) NOT NULL DEFAULT 'source-analysis-v1',
  ADD COLUMN IF NOT EXISTS provider VARCHAR(32) NOT NULL DEFAULT 'gemini',
  ADD COLUMN IF NOT EXISTS provider_run_id VARCHAR(255);

DROP INDEX IF EXISTS content_source_analysis_version_idx;
CREATE UNIQUE INDEX IF NOT EXISTS content_source_analysis_version_idx
  ON content_source_analyses(source_id, source_text_hash, schema_version) WHERE status='completed';
