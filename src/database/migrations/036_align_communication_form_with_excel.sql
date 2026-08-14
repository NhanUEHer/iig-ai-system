-- The communication detail form follows the source Excel layout. These KPIs
-- have no auditable detail source in that layout and must be entered in KPI summary.
UPDATE report_kpi_definitions
SET input_mode='manual', formula_code=NULL, updated_at=CURRENT_TIMESTAMP
WHERE team_code='COM' AND code IN ('TT_04','TT_05','TT_08');

-- Open manual forms carry a metadata snapshot. Align those drafts as well,
-- while keeping approved and published report history immutable.
UPDATE report_kpi_values value
SET input_mode_snapshot='manual', formula_code_snapshot=NULL, updated_at=CURRENT_TIMESTAMP
FROM report_data_versions version
WHERE value.version_id=version.id
  AND version.source_type='manual_entry'
  AND version.status='draft'
  AND value.kpi_code IN ('TT_04','TT_05','TT_08');
