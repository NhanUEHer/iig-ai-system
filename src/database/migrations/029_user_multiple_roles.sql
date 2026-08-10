-- Additive many-to-many role assignments. The legacy users.role column remains
-- during the compatibility window and represents the primary role only.
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_roles_one_primary
  ON user_roles(user_id) WHERE is_primary = TRUE;

-- Preserve every existing assignment and mark it as the primary role.
INSERT INTO user_roles (user_id, role_id, is_primary)
SELECT u.id, r.id, TRUE
FROM users u
JOIN roles r ON r.slug = u.role
ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = TRUE;

CREATE TABLE IF NOT EXISTS user_role_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  previous_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_role_audit_user_created
  ON user_role_audit_logs(user_id, created_at DESC);
