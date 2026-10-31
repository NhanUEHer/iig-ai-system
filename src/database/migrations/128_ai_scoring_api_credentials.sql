-- Tenant-scoped API credentials. Raw token material is never persisted.

CREATE TABLE IF NOT EXISTS integration_api_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES integration_tenants(id) ON DELETE RESTRICT,
  name VARCHAR(160) NOT NULL,
  token_prefix VARCHAR(32) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  superseded_by_id UUID REFERENCES integration_api_credentials(id) ON DELETE RESTRICT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_integration_api_credentials_token_hash UNIQUE (token_hash),
  CONSTRAINT chk_integration_api_credentials_status CHECK (status IN ('ACTIVE', 'ROTATING', 'REVOKED')),
  CONSTRAINT chk_integration_api_credentials_scopes CHECK (jsonb_typeof(scopes) = 'array'),
  CONSTRAINT chk_integration_api_credentials_expiry CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_integration_api_credentials_tenant_status
  ON integration_api_credentials(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_api_credentials_prefix
  ON integration_api_credentials(token_prefix);

UPDATE roles
SET permissions = permissions || '["ai_scoring.credentials.view","ai_scoring.credentials.manage"]'::jsonb
WHERE slug = 'admin'
  AND NOT (permissions ? 'ai_scoring.credentials.view' AND permissions ? 'ai_scoring.credentials.manage');
