UPDATE report_kpi_definitions definition
SET input_mode='manual',formula_code=NULL,updated_at=CURRENT_TIMESTAMP
FROM report_teams team
WHERE definition.team_id=team.id
  AND team.code='PROD'
  AND definition.code IN('SP_01','SP_02','SP_03','SP_04','SP_05');

UPDATE report_kpi_values value
SET input_mode_snapshot='manual',formula_code_snapshot=NULL,updated_at=CURRENT_TIMESTAMP
FROM report_data_versions version
WHERE value.version_id=version.id
  AND version.source_type='manual_entry'
  AND version.status='draft'
  AND value.kpi_code IN('SP_01','SP_02','SP_03','SP_04','SP_05');
