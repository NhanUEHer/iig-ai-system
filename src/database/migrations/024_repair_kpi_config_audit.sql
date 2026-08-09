-- Repair environments where migration 020 was registered before the KPI audit
-- table statement was introduced into that migration file.
CREATE TABLE IF NOT EXISTS report_kpi_definition_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_definition_id UUID NOT NULL REFERENCES report_kpi_definitions(id),
  action VARCHAR(30) NOT NULL CHECK(action IN ('created','updated','activated','deactivated','reordered')),
  actor_id UUID NOT NULL REFERENCES users(id),
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS report_kpi_definition_audit_created_idx
  ON report_kpi_definition_audit_logs(kpi_definition_id,created_at DESC);
