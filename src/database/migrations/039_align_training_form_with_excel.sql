-- The training detail form follows the 12-column source Excel layout.
-- Opening and closing class counts exist only in the KPI summary, so they
-- must remain editable instead of being derived from hidden detail columns.
UPDATE report_kpi_definitions definition
SET input_mode='manual', formula_code=NULL, updated_at=CURRENT_TIMESTAMP
FROM report_teams team
WHERE definition.team_id=team.id
  AND team.code='TRAIN'
  AND definition.code IN ('DAO_05','DAO_07');

-- Align open manual drafts without changing approved or published history.
UPDATE report_kpi_values value
SET input_mode_snapshot='manual', formula_code_snapshot=NULL, updated_at=CURRENT_TIMESTAMP
FROM report_data_versions version
WHERE value.version_id=version.id
  AND version.source_type='manual_entry'
  AND version.status='draft'
  AND value.kpi_code IN ('DAO_05','DAO_07');
