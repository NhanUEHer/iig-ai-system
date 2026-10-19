ALTER TABLE report_detail_row_templates ADD COLUMN IF NOT EXISTS section_key VARCHAR(40) NOT NULL DEFAULT 'primary';
CREATE INDEX IF NOT EXISTS report_detail_row_templates_section_idx ON report_detail_row_templates(team_id,section_key,is_active,display_order);
