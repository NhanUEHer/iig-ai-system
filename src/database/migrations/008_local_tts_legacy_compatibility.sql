ALTER TABLE local_tts_history ADD COLUMN IF NOT EXISTS language VARCHAR(10) NOT NULL DEFAULT 'en';
ALTER TABLE local_tts_history ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC(8,2);
ALTER TABLE local_tts_history ADD COLUMN IF NOT EXISTS raw_script JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE local_tts_history ADD COLUMN IF NOT EXISTS audio_path TEXT;

