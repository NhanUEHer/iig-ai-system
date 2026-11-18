-- Providers are validated by the adapter registry in code, so adding an integration
-- needs no schema change. Replace the hardcoded provider lists with a format check.
ALTER TABLE aic_connections DROP CONSTRAINT IF EXISTS aic_connections_provider_check;
ALTER TABLE aic_models DROP CONSTRAINT IF EXISTS aic_models_provider_check;
ALTER TABLE aic_connections DROP CONSTRAINT IF EXISTS aic_connections_provider_format;
ALTER TABLE aic_models DROP CONSTRAINT IF EXISTS aic_models_provider_format;
ALTER TABLE aic_connections ADD CONSTRAINT aic_connections_provider_format CHECK (provider ~ '^[a-z0-9_-]{2,40}$');
ALTER TABLE aic_models ADD CONSTRAINT aic_models_provider_format CHECK (provider ~ '^[a-z0-9_-]{2,40}$');
