-- Fingerprint of the source (passage / question) a generated artifact was built from.
-- When the source is edited the fingerprint no longer matches and the artifact is shown as stale.
ALTER TABLE cs_artifacts ADD COLUMN IF NOT EXISTS source_hash TEXT;
