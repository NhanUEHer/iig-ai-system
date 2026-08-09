-- Clarify KPI evaluation semantics. "monitor" means informational and is not
-- included in the health score; catalog items with a real target get an
-- explicit direction.
UPDATE report_kpi_definitions SET evaluation_direction = 'increase_good'
WHERE code IN ('DT_06','DAO_03','DAO_06','DAO_07','DAO_08');

UPDATE report_kpi_definitions SET evaluation_direction = 'decrease_good'
WHERE code IN ('ADS_05','TT_08','TRADE_09');

CREATE INDEX IF NOT EXISTS report_imports_created_idx
  ON report_imports(created_at DESC);
CREATE INDEX IF NOT EXISTS report_imports_status_created_idx
  ON report_imports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS report_data_versions_period_status_idx
  ON report_data_versions(period_id, status);

-- A template code can have multiple versions; only one active version is
-- allowed for a code.
ALTER TABLE report_templates DROP CONSTRAINT IF EXISTS report_templates_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS report_templates_code_version_uq
  ON report_templates(code, version);
CREATE UNIQUE INDEX IF NOT EXISTS report_templates_one_active_code_uq
  ON report_templates(code) WHERE is_active = TRUE;
