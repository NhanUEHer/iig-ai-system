ALTER TABLE report_manual_submissions
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS report_manual_submissions_assigned_user_idx
  ON report_manual_submissions(assigned_user_id, status);

-- Chuyển quyền cũ sang bộ quyền chi tiết, không làm mất quyền của role hiện hữu.
UPDATE roles
SET permissions = permissions || '["reports.entry"]'::jsonb
WHERE permissions ? 'reports.upload' AND NOT permissions ? 'reports.entry';

UPDATE roles SET permissions = permissions || '["reports.entry"]'::jsonb
WHERE permissions ? 'reports.manage' AND NOT permissions ? 'reports.entry';
UPDATE roles SET permissions = permissions || '["reports.review"]'::jsonb
WHERE permissions ? 'reports.manage' AND NOT permissions ? 'reports.review';
UPDATE roles SET permissions = permissions || '["reports.publish"]'::jsonb
WHERE permissions ? 'reports.manage' AND NOT permissions ? 'reports.publish';
UPDATE roles SET permissions = permissions || '["reports.assign"]'::jsonb
WHERE permissions ? 'reports.manage' AND NOT permissions ? 'reports.assign';
UPDATE roles SET permissions = permissions || '["reports.forms.view"]'::jsonb
WHERE permissions ? 'reports.manage' AND NOT permissions ? 'reports.forms.view';

UPDATE roles
SET permissions = permissions || '["reports.review"]'::jsonb
WHERE slug = 'manager' AND NOT permissions ? 'reports.review';

UPDATE roles SET permissions = permissions || '["reports.forms.view"]'::jsonb
WHERE slug IN ('admin','manager') AND NOT permissions ? 'reports.forms.view';

UPDATE roles
SET permissions = permissions || '["reports.entry","reports.review","reports.publish","reports.assign"]'::jsonb
WHERE slug = 'admin' AND NOT permissions ? 'reports.assign';
