-- Grant job-detail investigation permissions to roles that already manage job lists.
UPDATE roles
SET permissions = permissions || '["ai_scoring.jobs.view_detail","ai_scoring.jobs.view_model_lineage"]'::jsonb
WHERE permissions ? 'ai_scoring.jobs.view'
  AND NOT (permissions ? 'ai_scoring.jobs.view_detail' AND permissions ? 'ai_scoring.jobs.view_model_lineage');
