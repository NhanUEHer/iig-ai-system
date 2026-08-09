ALTER TABLE local_tts_history ADD COLUMN IF NOT EXISTS engine VARCHAR(80) NOT NULL DEFAULT 'legacy';
ALTER TABLE local_tts_history ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE local_tts_history ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;
ALTER TABLE local_tts_history ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS local_tts_history_created_at_idx ON local_tts_history(created_at DESC);
CREATE INDEX IF NOT EXISTS local_tts_history_content_type_idx ON local_tts_history(content_type);

