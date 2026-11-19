-- Models come from the provider's own model list; NULL = never synced.
ALTER TABLE aic_models ADD COLUMN IF NOT EXISTS provider_available BOOLEAN;
ALTER TABLE aic_models ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
