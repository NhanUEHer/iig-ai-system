ALTER TABLE iig_scoring_jobs
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES integration_tenants(id) ON DELETE RESTRICT;

ALTER TABLE iig_scoring_job_idempotency_keys
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES integration_tenants(id) ON DELETE RESTRICT;

-- Prefer the credential lineage for jobs created through the tenant API.
UPDATE iig_scoring_jobs job
SET tenant_id = credential.tenant_id
FROM integration_api_credentials credential
WHERE job.credential_id = credential.id
  AND job.tenant_id IS NULL;

-- Legacy local data predates credential lineage. It is safe to attach it only
-- when the installation has exactly one tenant; otherwise fail below rather
-- than assigning another tenant's data.
UPDATE iig_scoring_jobs
SET tenant_id = (
  SELECT MIN(id::text)::uuid
  FROM integration_tenants
  HAVING COUNT(*) = 1
)
WHERE tenant_id IS NULL;

UPDATE iig_scoring_job_idempotency_keys key
SET tenant_id = job.tenant_id
FROM iig_scoring_jobs job
WHERE key.scoring_job_id = job.id
  AND key.tenant_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM iig_scoring_jobs WHERE tenant_id IS NULL)
     OR EXISTS (SELECT 1 FROM iig_scoring_job_idempotency_keys WHERE tenant_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot infer tenant ownership for legacy scoring jobs';
  END IF;
END $$;

ALTER TABLE iig_scoring_jobs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE iig_scoring_job_idempotency_keys ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE iig_scoring_job_idempotency_keys
  DROP CONSTRAINT IF EXISTS uq_iig_job_idempotency_partner_key;

ALTER TABLE iig_scoring_job_idempotency_keys
  DROP CONSTRAINT IF EXISTS uq_iig_job_idempotency_tenant_key;

ALTER TABLE iig_scoring_job_idempotency_keys
  ADD CONSTRAINT uq_iig_job_idempotency_tenant_key UNIQUE (tenant_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_iig_scoring_jobs_tenant_id
  ON iig_scoring_jobs(tenant_id, id);

CREATE INDEX IF NOT EXISTS idx_iig_scoring_jobs_tenant_source_attempts
  ON iig_scoring_jobs(tenant_id, partner, source_scoring_id, accepted_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_iig_scoring_jobs_tenant_status
  ON iig_scoring_jobs(tenant_id, status, accepted_at DESC);
