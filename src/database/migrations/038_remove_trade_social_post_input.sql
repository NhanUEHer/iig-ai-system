-- TRADE_06 is entered at KPI summary because the Trade detail form no longer
-- captures social posts per activity. Preserve historical published snapshots.
UPDATE report_kpi_definitions definition
SET input_mode='manual', formula_code=NULL, updated_at=CURRENT_TIMESTAMP
FROM report_teams team
WHERE definition.team_id=team.id
  AND team.code='TRADE'
  AND definition.code='TRADE_06';

UPDATE report_kpi_values value
SET input_mode_snapshot='manual', formula_code_snapshot=NULL, updated_at=CURRENT_TIMESTAMP
FROM report_data_versions version
WHERE value.version_id=version.id
  AND version.source_type='manual_entry'
  AND version.status='draft'
  AND value.kpi_code='TRADE_06';
