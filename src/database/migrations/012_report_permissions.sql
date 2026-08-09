UPDATE roles SET permissions = permissions || '["reports.view","reports.upload","reports.manage"]'::jsonb
WHERE slug = 'admin' AND NOT permissions ? 'reports.view';

UPDATE roles SET permissions = permissions || '["reports.view"]'::jsonb
WHERE slug = 'manager' AND NOT permissions ? 'reports.view';
