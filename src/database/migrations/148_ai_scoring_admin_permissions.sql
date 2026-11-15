-- AI Scoring owns its operational schema in a separate database. IIG Admin
-- still needs these permission codes to authorize its AI Scoring BFF routes.
-- This migration intentionally creates no AI Scoring tables or constraints.

WITH required_permissions(permission) AS (
  VALUES
    ('ai_scoring.tenants.view'),
    ('ai_scoring.tenants.manage'),
    ('ai_scoring.credentials.view'),
    ('ai_scoring.credentials.manage'),
    ('ai_scoring.webhooks.view'),
    ('ai_scoring.webhooks.manage'),
    ('ai_scoring.webhooks.replay'),
    ('ai_scoring.jobs.view'),
    ('ai_scoring.jobs.export'),
    ('ai_scoring.jobs.view_detail'),
    ('ai_scoring.jobs.view_model_lineage'),
    ('ai_scoring.operations.retry'),
    ('ai_scoring.operations.cancel'),
    ('ai_scoring.operations.rescore'),
    ('ai_scoring.operations.reconcile'),
    ('ai_scoring.audit.view')
)
UPDATE roles AS role
SET permissions = (
      SELECT jsonb_agg(permission ORDER BY permission)
      FROM (
        SELECT jsonb_array_elements_text(COALESCE(role.permissions, '[]'::jsonb)) AS permission
        UNION
        SELECT permission FROM required_permissions
      ) AS merged_permissions
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE role.slug = 'admin';

-- Preserve the historical detail visibility of any role that already had the
-- base scoring-jobs permission without broadening its operational privileges.
WITH detail_permissions(permission) AS (
  VALUES
    ('ai_scoring.jobs.view_detail'),
    ('ai_scoring.jobs.view_model_lineage')
)
UPDATE roles AS role
SET permissions = (
      SELECT jsonb_agg(permission ORDER BY permission)
      FROM (
        SELECT jsonb_array_elements_text(COALESCE(role.permissions, '[]'::jsonb)) AS permission
        UNION
        SELECT permission FROM detail_permissions
      ) AS merged_permissions
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE COALESCE(role.permissions, '[]'::jsonb) ? 'ai_scoring.jobs.view';
