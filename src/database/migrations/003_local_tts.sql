CREATE TABLE IF NOT EXISTS local_voice_clones (
  id SERIAL PRIMARY KEY,
  voice_name VARCHAR(255) NOT NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'vi',
  ref_audio_path TEXT NOT NULL,
  ref_text TEXT,
  speaker_embedding JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS local_tts_history (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content_type VARCHAR(50) NOT NULL DEFAULT 'dialogue',
  language VARCHAR(10) NOT NULL DEFAULT 'vi',
  raw_script JSONB NOT NULL,
  audio_path TEXT NOT NULL,
  duration_seconds NUMERIC(6,2),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

