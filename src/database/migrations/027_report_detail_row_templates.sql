CREATE TABLE IF NOT EXISTS report_detail_row_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES report_teams(id) ON DELETE CASCADE,
  row_code VARCHAR(80) NOT NULL,
  row_name VARCHAR(255) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id,row_code)
);
CREATE INDEX IF NOT EXISTS report_detail_row_templates_team_order_idx ON report_detail_row_templates(team_id,is_active,display_order);

WITH sources AS (
  SELECT 'REV' team_code,product_code code,product_name name,display_order FROM report_revenue_details WHERE version_id=(SELECT current_version_id FROM report_periods WHERE current_version_id IS NOT NULL ORDER BY year DESC,month DESC LIMIT 1)
  UNION ALL SELECT 'ADS',channel_code,traffic_source,display_order FROM report_ads_channel_details WHERE version_id=(SELECT current_version_id FROM report_periods WHERE current_version_id IS NOT NULL ORDER BY year DESC,month DESC LIMIT 1)
  UNION ALL SELECT 'COM',channel_code,channel_name,display_order FROM report_social_details WHERE version_id=(SELECT current_version_id FROM report_periods WHERE current_version_id IS NOT NULL ORDER BY year DESC,month DESC LIMIT 1)
  UNION ALL SELECT 'TRADE',organization_code,organization_name,display_order FROM report_trade_details WHERE version_id=(SELECT current_version_id FROM report_periods WHERE current_version_id IS NOT NULL ORDER BY year DESC,month DESC LIMIT 1)
  UNION ALL SELECT 'TRAIN',course_code,course_name,display_order FROM report_training_details WHERE version_id=(SELECT current_version_id FROM report_periods WHERE current_version_id IS NOT NULL ORDER BY year DESC,month DESC LIMIT 1)
  UNION ALL SELECT 'PROD',activity_code,activity_name,display_order FROM report_product_details WHERE version_id=(SELECT current_version_id FROM report_periods WHERE current_version_id IS NOT NULL ORDER BY year DESC,month DESC LIMIT 1)
), numbered AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY team_code ORDER BY display_order,name) row_no FROM sources WHERE NULLIF(TRIM(name),'') IS NOT NULL)
INSERT INTO report_detail_row_templates(team_id,row_code,row_name,display_order)
SELECT t.id,COALESCE(NULLIF(TRIM(n.code),''),n.team_code||'_ROW_'||LPAD(n.row_no::text,2,'0')),TRIM(n.name),n.row_no FROM numbered n JOIN report_teams t ON t.code=n.team_code
ON CONFLICT(team_id,row_code) DO NOTHING;
