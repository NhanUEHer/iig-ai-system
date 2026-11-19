-- How much the model may "think" before answering. off = disabled (DeepSeek) / minimal (Gemini 3).
ALTER TABLE aic_agent_versions ADD COLUMN IF NOT EXISTS thinking_mode TEXT NOT NULL DEFAULT 'off'
  CHECK (thinking_mode IN ('off','low','medium','high','default'));
