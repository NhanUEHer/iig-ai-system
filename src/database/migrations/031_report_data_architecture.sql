-- Add the missing source fields required to derive KPI values from detail data.
ALTER TABLE report_training_details ADD COLUMN IF NOT EXISTS evaluated_student_count NUMERIC;
ALTER TABLE report_product_details ADD COLUMN IF NOT EXISTS kpi_code VARCHAR(40);
ALTER TABLE report_product_details ADD COLUMN IF NOT EXISTS contribution_value NUMERIC;
ALTER TABLE report_product_details ADD COLUMN IF NOT EXISTS progress_percent NUMERIC;

ALTER TABLE report_product_details DROP CONSTRAINT IF EXISTS report_product_progress_percent_check;
ALTER TABLE report_product_details ADD CONSTRAINT report_product_progress_percent_check
  CHECK(progress_percent IS NULL OR (progress_percent >= 0 AND progress_percent <= 100));

CREATE TABLE IF NOT EXISTS report_history_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES report_data_versions(id) ON DELETE CASCADE,
  comparison_type VARCHAR(30) NOT NULL CHECK(comparison_type IN ('previous_period','prior_year')),
  source_period_id UUID NOT NULL REFERENCES report_periods(id),
  source_version_id UUID NOT NULL REFERENCES report_data_versions(id),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(version_id,comparison_type)
);

WITH values_to_seed(category,code,label,display_order) AS (VALUES
  ('trade_activity','SCHOOL_ACTIVATION','Activation trường',1),
  ('trade_activity','WORKSHOP','Workshop',2),
  ('trade_activity','SOCIAL_SEEDING','Social Seeding',3),
  ('trade_activity','EMAIL','Email',4),
  ('trade_activity','THREADS','Threads',5),
  ('trade_activity','ZBS','ZBS',6),
  ('trade_activity','OTHER','Khác',7),
  ('product_kpi','SP_01','SP_01',1),
  ('product_kpi','SP_02','SP_02',2),
  ('product_kpi','SP_03','SP_03',3),
  ('product_kpi','SP_04','SP_04',4),
  ('product_kpi','SP_05','SP_05',5)
)
INSERT INTO report_lookup_values(category,code,label,display_order)
SELECT category,code,label,display_order FROM values_to_seed
ON CONFLICT(category,code) DO UPDATE SET label=EXCLUDED.label,display_order=EXCLUDED.display_order,is_active=TRUE,updated_at=CURRENT_TIMESTAMP;

-- Only KPIs with a complete, auditable detail source are derived.
UPDATE report_kpi_definitions SET input_mode='derived',formula_code=code,updated_at=CURRENT_TIMESTAMP
WHERE code IN (
  'DT_01','DT_03','DT_04',
  'ADS_01','ADS_02','ADS_03','ADS_04','ADS_05','ADS_06','ADS_07',
  'TT_01','TT_02','TT_03','TT_04','TT_05','TT_06','TT_07','TT_08','TT_09',
  'TRADE_02','TRADE_03','TRADE_04','TRADE_05','TRADE_06','TRADE_07','TRADE_08','TRADE_09','TRADE_10','TRADE_11',
  'DAO_01','DAO_02','DAO_03','DAO_04','DAO_05','DAO_06','DAO_07','DAO_09',
  'SP_01','SP_02','SP_03','SP_04','SP_05'
);

-- These remain manual until an authoritative source is connected.
UPDATE report_kpi_definitions SET input_mode='manual',formula_code=NULL,updated_at=CURRENT_TIMESTAMP
WHERE code IN ('DT_02','DT_05','DT_06','TRADE_01','DAO_08');
