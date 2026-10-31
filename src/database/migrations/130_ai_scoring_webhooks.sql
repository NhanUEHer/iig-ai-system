-- Tenant webhook configuration, durable deliveries and attempt history.

CREATE TABLE IF NOT EXISTS integration_webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES integration_tenants(id) ON DELETE RESTRICT,
  name VARCHAR(120) NOT NULL,
  url TEXT NOT NULL,
  event_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  secret_prefix VARCHAR(24) NOT NULL,
  secret_ciphertext TEXT NOT NULL,
  secret_iv VARCHAR(64) NOT NULL,
  secret_tag VARCHAR(64) NOT NULL,
  secret_version INTEGER NOT NULL DEFAULT 1,
  last_delivery_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_integration_webhook_endpoint_name UNIQUE (tenant_id, name),
  CONSTRAINT chk_integration_webhook_events CHECK (jsonb_typeof(event_types) = 'array' AND jsonb_array_length(event_types) > 0),
  CONSTRAINT chk_integration_webhook_status CHECK (status IN ('ACTIVE','DISABLED')),
  CONSTRAINT chk_integration_webhook_secret_version CHECK (secret_version > 0)
);

CREATE INDEX IF NOT EXISTS idx_integration_webhook_endpoints_tenant
  ON integration_webhook_endpoints(tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS integration_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES integration_webhook_endpoints(id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES integration_tenants(id) ON DELETE RESTRICT,
  job_id UUID REFERENCES iig_scoring_jobs(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(160),
  delivered_at TIMESTAMPTZ,
  last_http_status INTEGER,
  last_error TEXT,
  replay_of_id UUID REFERENCES integration_webhook_deliveries(id) ON DELETE RESTRICT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_integration_webhook_delivery_event UNIQUE (endpoint_id, event_id),
  CONSTRAINT chk_integration_webhook_delivery_payload CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT chk_integration_webhook_delivery_status CHECK (status IN ('PENDING','PROCESSING','RETRY','DELIVERED','DEAD_LETTER')),
  CONSTRAINT chk_integration_webhook_delivery_attempts CHECK (attempt_count >= 0 AND max_attempts BETWEEN 1 AND 20),
  CONSTRAINT chk_integration_webhook_delivery_http CHECK (last_http_status IS NULL OR last_http_status BETWEEN 100 AND 599)
);

CREATE INDEX IF NOT EXISTS idx_integration_webhook_deliveries_claim
  ON integration_webhook_deliveries(status, available_at, created_at)
  WHERE status IN ('PENDING','RETRY');
CREATE INDEX IF NOT EXISTS idx_integration_webhook_deliveries_tenant
  ON integration_webhook_deliveries(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_webhook_deliveries_endpoint
  ON integration_webhook_deliveries(endpoint_id, created_at DESC);

CREATE TABLE IF NOT EXISTS integration_webhook_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES integration_webhook_deliveries(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  request_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_status INTEGER,
  response_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_excerpt TEXT,
  error_code VARCHAR(80),
  error_message TEXT,
  latency_ms INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMPTZ,
  CONSTRAINT uq_integration_webhook_attempt_number UNIQUE (delivery_id, attempt_number),
  CONSTRAINT chk_integration_webhook_attempt_number CHECK (attempt_number > 0),
  CONSTRAINT chk_integration_webhook_attempt_latency CHECK (latency_ms IS NULL OR latency_ms >= 0),
  CONSTRAINT chk_integration_webhook_attempt_headers CHECK (jsonb_typeof(request_headers) = 'object' AND jsonb_typeof(response_headers) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_integration_webhook_attempts_delivery
  ON integration_webhook_attempts(delivery_id, attempt_number DESC);

UPDATE roles
SET permissions = permissions || '["ai_scoring.webhooks.view","ai_scoring.webhooks.manage","ai_scoring.webhooks.replay"]'::jsonb
WHERE slug = 'admin'
  AND NOT (
    permissions ? 'ai_scoring.webhooks.view'
    AND permissions ? 'ai_scoring.webhooks.manage'
    AND permissions ? 'ai_scoring.webhooks.replay'
  );
