-- DAO_09 values are stored as VND. Normalize only the display-unit metadata;
-- do not scale target/actual/history values.
UPDATE report_kpi_definitions d
SET unit = 'Triệu đồng',
    updated_at = CURRENT_TIMESTAMP
FROM report_teams t
WHERE d.team_id = t.id
  AND t.code = 'TRAIN'
  AND d.code = 'DAO_09'
  AND d.unit IS DISTINCT FROM 'Triệu đồng';

-- Published and draft report versions keep KPI metadata snapshots, so update
-- every existing Training/DAO_09 snapshot to keep historical dashboards aligned.
UPDATE report_kpi_values v
SET unit_snapshot = 'Triệu đồng'
FROM report_kpi_definitions d
JOIN report_teams t ON t.id = d.team_id
WHERE v.kpi_definition_id = d.id
  AND t.code = 'TRAIN'
  AND d.code = 'DAO_09'
  AND v.unit_snapshot IS DISTINCT FROM 'Triệu đồng';
