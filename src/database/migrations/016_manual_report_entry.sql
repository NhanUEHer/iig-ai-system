ALTER TABLE report_periods DROP CONSTRAINT IF EXISTS report_periods_status_check;
ALTER TABLE report_periods ADD CONSTRAINT report_periods_status_check
  CHECK (status IN ('draft','open','in_progress','submitted','approved','published','locked','reopened'));

CREATE TABLE IF NOT EXISTS report_manual_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES report_periods(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES report_data_versions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES report_teams(id),
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','editing','submitted','returned','approved')),
  validation_result JSONB NOT NULL DEFAULT '{"errors":[],"warnings":[]}'::jsonb,
  submitted_by UUID REFERENCES users(id), submitted_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id), reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (version_id, team_id)
);

CREATE INDEX IF NOT EXISTS report_manual_submissions_period_status_idx
  ON report_manual_submissions(period_id, status);

CREATE TABLE IF NOT EXISTS report_entry_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id UUID NOT NULL REFERENCES report_periods(id) ON DELETE CASCADE,
  version_id UUID REFERENCES report_data_versions(id) ON DELETE SET NULL,
  team_id UUID REFERENCES report_teams(id),
  action VARCHAR(40) NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id),
  change_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS report_entry_audit_period_created_idx
  ON report_entry_audit_logs(period_id, created_at DESC);

ALTER TABLE report_kpi_definitions ADD COLUMN IF NOT EXISTS input_mode VARCHAR(20) NOT NULL DEFAULT 'manual'
  CHECK (input_mode IN ('manual','derived','hybrid'));
ALTER TABLE report_kpi_definitions ADD COLUMN IF NOT EXISTS formula_code VARCHAR(60);

UPDATE report_kpi_definitions SET input_mode='derived',formula_code=code WHERE code IN
('DT_01','DT_03','DT_04','DT_05','ADS_01','ADS_02','ADS_03','ADS_04','ADS_05','ADS_06','ADS_07',
 'TT_01','TT_02','TT_03','TT_04','TT_05','TT_06','TT_07','TT_08','TT_09',
 'TRADE_02','TRADE_03','TRADE_04','TRADE_05','TRADE_06','TRADE_07','TRADE_08','TRADE_09','TRADE_10','TRADE_11',
 'DAO_01','DAO_02','DAO_03','DAO_04','DAO_05','DAO_06','DAO_07','DAO_08','DAO_09');

UPDATE report_kpi_definitions SET input_mode='manual',formula_code=NULL WHERE code IN
('DT_02','DT_06','TRADE_01','SP_01','SP_02','SP_03','SP_04','SP_05');
