-- AI Core foundation. This schema is intentionally separate from the legacy
-- scoring tables, which remain owned by the existing features.

CREATE TABLE IF NOT EXISTS aic_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'deepseek')),
  name TEXT NOT NULL UNIQUE,
  api_key_ciphertext BYTEA NOT NULL,
  api_key_iv BYTEA NOT NULL CHECK (octet_length(api_key_iv) = 12),
  api_key_tag BYTEA NOT NULL CHECK (octet_length(api_key_tag) = 16),
  api_key_last4 TEXT NOT NULL CHECK (char_length(api_key_last4) = 4),
  key_version INTEGER NOT NULL DEFAULT 1 CHECK (key_version > 0),
  base_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  last_check_at TIMESTAMPTZ,
  last_check_ok BOOLEAN,
  last_check_ms INTEGER CHECK (last_check_ms IS NULL OR last_check_ms >= 0),
  last_check_error TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aic_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'deepseek')),
  model TEXT NOT NULL,
  price_in_per_m NUMERIC(14,8) NOT NULL DEFAULT 0 CHECK (price_in_per_m >= 0),
  price_cached_in_per_m NUMERIC(14,8) NOT NULL DEFAULT 0 CHECK (price_cached_in_per_m >= 0),
  price_out_per_m NUMERIC(14,8) NOT NULL DEFAULT 0 CHECK (price_out_per_m >= 0),
  context_window INTEGER NOT NULL DEFAULT 0 CHECK (context_window >= 0),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('active', 'disabled')),
  UNIQUE (provider, model)
);

CREATE TABLE IF NOT EXISTS aic_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9]+(\.[a-z0-9_]+)+$'),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  feature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  max_cost_per_call_usd NUMERIC(14,8) NOT NULL DEFAULT 0 CHECK (max_cost_per_call_usd >= 0),
  monthly_budget_usd NUMERIC(14,8) NOT NULL DEFAULT 0 CHECK (monthly_budget_usd >= 0),
  alert_threshold_pct INTEGER NOT NULL DEFAULT 80 CHECK (alert_threshold_pct BETWEEN 1 AND 100),
  max_concurrency INTEGER NOT NULL DEFAULT 4 CHECK (max_concurrency > 0),
  published_version_id UUID,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aic_agent_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES aic_agents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  connection_id UUID NOT NULL REFERENCES aic_connections(id),
  model TEXT NOT NULL,
  fallback_connection_id UUID REFERENCES aic_connections(id),
  fallback_model TEXT,
  system_prompt TEXT NOT NULL DEFAULT '',
  user_template TEXT NOT NULL DEFAULT '',
  variables JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(variables) = 'array'),
  output_schema JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(output_schema) = 'object'),
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0 CHECK (temperature BETWEEN 0 AND 2),
  max_input_tokens INTEGER NOT NULL CHECK (max_input_tokens > 0),
  max_output_tokens INTEGER NOT NULL CHECK (max_output_tokens > 0),
  timeout_ms INTEGER NOT NULL DEFAULT 60000 CHECK (timeout_ms > 0),
  max_retries INTEGER NOT NULL DEFAULT 2 CHECK (max_retries BETWEEN 0 AND 5),
  repair_invalid_json BOOLEAN NOT NULL DEFAULT TRUE,
  change_note TEXT NOT NULL DEFAULT '',
  last_test_ok_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMPTZ,
  UNIQUE (agent_id, version),
  CHECK (
    (fallback_connection_id IS NULL AND fallback_model IS NULL)
    OR (fallback_connection_id IS NOT NULL AND fallback_model IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS aic_agent_versions_one_draft_idx
  ON aic_agent_versions(agent_id) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS aic_agent_versions_one_published_idx
  ON aic_agent_versions(agent_id) WHERE status = 'published';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'aic_agents_published_version_fk'
      AND conrelid = 'aic_agents'::regclass
  ) THEN
    ALTER TABLE aic_agents
      ADD CONSTRAINT aic_agents_published_version_fk
      FOREIGN KEY (published_version_id)
      REFERENCES aic_agent_versions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS aic_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES aic_agents(id),
  version_id UUID REFERENCES aic_agent_versions(id),
  agent_key TEXT NOT NULL,
  version INTEGER,
  mode TEXT NOT NULL DEFAULT 'run' CHECK (mode IN ('run', 'test')),
  feature TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  provider TEXT,
  model TEXT,
  connection_id UUID REFERENCES aic_connections(id),
  used_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'blocked')),
  error_code TEXT,
  error_message TEXT CHECK (error_message IS NULL OR char_length(error_message) <= 500),
  finish_reason TEXT CHECK (finish_reason IS NULL OR finish_reason IN ('stop', 'length', 'safety', 'other')),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  cached_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  thinking_tokens INTEGER NOT NULL DEFAULT 0 CHECK (thinking_tokens >= 0),
  estimated_max_cost_usd NUMERIC(14,8) NOT NULL DEFAULT 0 CHECK (estimated_max_cost_usd >= 0),
  cost_usd NUMERIC(14,8) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  price_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(price_snapshot) = 'object'),
  schema_valid_first_try BOOLEAN,
  repaired BOOLEAN NOT NULL DEFAULT FALSE,
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  request_preview TEXT,
  response_preview TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS aic_call_logs_agent_created_idx
  ON aic_call_logs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS aic_call_logs_created_idx
  ON aic_call_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS aic_call_logs_ref_idx
  ON aic_call_logs(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS aic_call_logs_status_created_idx
  ON aic_call_logs(status, created_at);

CREATE TABLE IF NOT EXISTS aic_usage_daily (
  day DATE NOT NULL,
  agent_id UUID NOT NULL REFERENCES aic_agents(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('run', 'test')),
  calls INTEGER NOT NULL DEFAULT 0 CHECK (calls >= 0),
  success INTEGER NOT NULL DEFAULT 0 CHECK (success >= 0),
  failed INTEGER NOT NULL DEFAULT 0 CHECK (failed >= 0),
  blocked INTEGER NOT NULL DEFAULT 0 CHECK (blocked >= 0),
  truncated INTEGER NOT NULL DEFAULT 0 CHECK (truncated >= 0),
  schema_first_try_ok INTEGER NOT NULL DEFAULT 0 CHECK (schema_first_try_ok >= 0),
  fallback INTEGER NOT NULL DEFAULT 0 CHECK (fallback >= 0),
  input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  cached_input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cost_usd NUMERIC(14,8) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  latency_p95_ms INTEGER CHECK (latency_p95_ms IS NULL OR latency_p95_ms >= 0),
  PRIMARY KEY (day, agent_id, mode)
);

INSERT INTO aic_models (provider, model, price_in_per_m, price_cached_in_per_m, price_out_per_m, context_window, status)
VALUES
  ('gemini', 'gemini-2.5-flash', 0, 0, 0, 0, 'disabled'),
  ('gemini', 'gemini-2.5-pro', 0, 0, 0, 0, 'disabled'),
  ('deepseek', 'deepseek-chat', 0, 0, 0, 0, 'disabled'),
  ('deepseek', 'deepseek-reasoner', 0, 0, 0, 0, 'disabled')
ON CONFLICT (provider, model) DO NOTHING;

WITH required_permissions(permission) AS (
  VALUES ('ai_core.view'), ('ai_core.manage'), ('ai_core.run')
)
UPDATE roles AS role
SET permissions = (
      SELECT jsonb_agg(permission ORDER BY permission)
      FROM (
        SELECT jsonb_array_elements_text(COALESCE(role.permissions, '[]'::jsonb)) AS permission
        UNION SELECT permission FROM required_permissions
      ) AS merged
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE role.slug = 'admin';
