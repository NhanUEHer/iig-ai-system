-- Repair drafts created before KPI sets were locked. Published history is never changed.
INSERT INTO report_kpi_values(
  version_id,kpi_definition_id,target_value,actual_value,previous_value,prior_year_value,source_type,created_by,
  kpi_code,kpi_name,unit_snapshot,evaluation_direction_snapshot,aggregation_method_snapshot,input_mode_snapshot,formula_code_snapshot,display_order_snapshot
)
SELECT version.id,definition.id,NULL,NULL,previous_value.actual_value,prior_value.actual_value,'manual_entry',version.created_by,
  definition.code,definition.name,definition.unit,definition.evaluation_direction,definition.aggregation_method,definition.input_mode,definition.formula_code,definition.display_order
FROM report_data_versions version
JOIN report_periods period ON period.id=version.period_id
CROSS JOIN report_kpi_definitions definition
LEFT JOIN report_periods previous_period ON previous_period.year=CASE WHEN period.month=1 THEN period.year-1 ELSE period.year END
  AND previous_period.month=CASE WHEN period.month=1 THEN 12 ELSE period.month-1 END
LEFT JOIN report_kpi_values previous_value ON previous_value.version_id=previous_period.current_version_id AND previous_value.kpi_definition_id=definition.id
LEFT JOIN report_periods prior_period ON prior_period.year=period.year-1 AND prior_period.month=period.month
LEFT JOIN report_kpi_values prior_value ON prior_value.version_id=prior_period.current_version_id AND prior_value.kpi_definition_id=definition.id
LEFT JOIN report_kpi_values existing ON existing.version_id=version.id AND existing.kpi_definition_id=definition.id
WHERE version.status='draft' AND version.source_type='manual_entry' AND definition.is_active=TRUE AND existing.id IS NULL;
