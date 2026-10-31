-- AI Scoring tenant management foundation.
-- Tenant configuration is durable and audit events are append-only.

CREATE TABLE IF NOT EXISTS integration_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) NOT NULL,
  name VARCHAR(200) NOT NULL,
  environment VARCHAR(20) NOT NULL DEFAULT 'PRODUCTION',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  contact_name VARCHAR(160),
  contact_email VARCHAR(320),
  allowed_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 120,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_integration_tenants_code UNIQUE (code),
  CONSTRAINT chk_integration_tenants_code CHECK (code ~ '^[A-Z][A-Z0-9_]{2,39}$'),
  CONSTRAINT chk_integration_tenants_environment CHECK (environment IN ('PRODUCTION', 'BETA', 'DEVELOPMENT')),
  CONSTRAINT chk_integration_tenants_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DISABLED')),
  CONSTRAINT chk_integration_tenants_rate_limit CHECK (rate_limit_per_minute BETWEEN 1 AND 100000),
  CONSTRAINT chk_integration_tenants_scopes CHECK (jsonb_typeof(allowed_scopes) = 'array'),
  CONSTRAINT chk_integration_tenants_metadata CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_integration_tenants_status_environment
  ON integration_tenants(status, environment, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_tenants_name_lower
  ON integration_tenants(LOWER(name));

CREATE TABLE IF NOT EXISTS ai_scoring_admin_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  action VARCHAR(80) NOT NULL,
  resource_type VARCHAR(80) NOT NULL,
  resource_id UUID,
  tenant_id UUID REFERENCES integration_tenants(id) ON DELETE RESTRICT,
  reason TEXT,
  request_id VARCHAR(120) NOT NULL,
  outcome VARCHAR(20) NOT NULL DEFAULT 'SUCCEEDED',
  before_state JSONB,
  after_state JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_ai_scoring_admin_audit_outcome CHECK (outcome IN ('SUCCEEDED', 'FAILED')),
  CONSTRAINT chk_ai_scoring_admin_audit_before CHECK (before_state IS NULL OR jsonb_typeof(before_state) = 'object'),
  CONSTRAINT chk_ai_scoring_admin_audit_after CHECK (after_state IS NULL OR jsonb_typeof(after_state) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_ai_scoring_admin_audit_resource
  ON ai_scoring_admin_audit_events(resource_type, resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_scoring_admin_audit_tenant
  ON ai_scoring_admin_audit_events(tenant_id, created_at DESC);

UPDATE roles
SET permissions = permissions || '["ai_scoring.tenants.view","ai_scoring.tenants.manage"]'::jsonb
WHERE slug = 'admin'
  AND NOT (permissions ? 'ai_scoring.tenants.view' AND permissions ? 'ai_scoring.tenants.manage');
