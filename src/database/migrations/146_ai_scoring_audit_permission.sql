-- Separate audit visibility from tenant configuration visibility.
UPDATE roles
SET permissions = permissions || '["ai_scoring.audit.view"]'::jsonb
WHERE slug = 'admin' AND NOT permissions ? 'ai_scoring.audit.view';
