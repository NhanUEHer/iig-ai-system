-- Revenue template rows already carried their configured product code and name,
-- but older period creation did not copy the configured product group.
UPDATE report_revenue_details detail
SET product_group = template.row_group
FROM report_detail_row_templates template
JOIN report_teams team ON team.id = template.team_id AND team.code = 'REV'
WHERE template.section_key = 'primary'
  AND template.row_group IS NOT NULL
  AND detail.product_code = template.row_code
  AND detail.product_group IS DISTINCT FROM template.row_group;
