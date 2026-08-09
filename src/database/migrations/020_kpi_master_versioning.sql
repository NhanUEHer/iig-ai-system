-- Snapshot KPI metadata per report version so later master-data changes never rewrite history.
ALTER TABLE report_kpi_values ADD COLUMN IF NOT EXISTS kpi_code VARCHAR(40);
ALTER TABLE report_kpi_values ADD COLUMN IF NOT EXISTS kpi_name VARCHAR(255);
ALTER TABLE report_kpi_values ADD COLUMN IF NOT EXISTS unit_snapshot VARCHAR(50);
ALTER TABLE report_kpi_values ADD COLUMN IF NOT EXISTS evaluation_direction_snapshot VARCHAR(20);
ALTER TABLE report_kpi_values ADD COLUMN IF NOT EXISTS aggregation_method_snapshot VARCHAR(30);
ALTER TABLE report_kpi_values ADD COLUMN IF NOT EXISTS input_mode_snapshot VARCHAR(20);
ALTER TABLE report_kpi_values ADD COLUMN IF NOT EXISTS formula_code_snapshot VARCHAR(60);
ALTER TABLE report_kpi_values ADD COLUMN IF NOT EXISTS display_order_snapshot SMALLINT;

UPDATE report_kpi_values v SET
  kpi_code=COALESCE(v.kpi_code,d.code),
  kpi_name=COALESCE(v.kpi_name,d.name),
  unit_snapshot=COALESCE(v.unit_snapshot,d.unit),
  evaluation_direction_snapshot=COALESCE(v.evaluation_direction_snapshot,d.evaluation_direction),
  aggregation_method_snapshot=COALESCE(v.aggregation_method_snapshot,d.aggregation_method),
  input_mode_snapshot=COALESCE(v.input_mode_snapshot,d.input_mode),
  formula_code_snapshot=COALESCE(v.formula_code_snapshot,d.formula_code),
  display_order_snapshot=COALESCE(v.display_order_snapshot,d.display_order)
FROM report_kpi_definitions d WHERE d.id=v.kpi_definition_id;

CREATE UNIQUE INDEX IF NOT EXISTS report_data_versions_one_manual_draft_uq
  ON report_data_versions(period_id)
  WHERE status='draft' AND source_type='manual_entry';

ALTER TABLE report_manual_submissions
  ADD CONSTRAINT report_manual_submissions_period_version_fk
  FOREIGN KEY(period_id,version_id)
  REFERENCES report_data_versions(period_id,id);

CREATE INDEX IF NOT EXISTS report_kpi_definitions_team_active_order_idx
  ON report_kpi_definitions(team_id,is_active,display_order);

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
