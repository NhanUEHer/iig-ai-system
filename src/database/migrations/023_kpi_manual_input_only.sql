-- Phase 2 uses direct monthly entry for every summary KPI. Calculated fields
-- such as achievement, prior-period comparison and evaluation remain derived.
UPDATE report_kpi_definitions
SET input_mode='manual', formula_code=NULL, updated_at=CURRENT_TIMESTAMP
WHERE input_mode<>'manual' OR formula_code IS NOT NULL;

-- Preserve published history while aligning any open draft created before this rule.
UPDATE report_kpi_values v
SET input_mode_snapshot='manual', formula_code_snapshot=NULL, updated_at=CURRENT_TIMESTAMP
FROM report_data_versions dv
WHERE dv.id=v.version_id AND dv.status='draft';
