-- Secure Lectures: isolated foundation for private HTML lecture delivery.
-- This migration owns only sl_* tables and the secure_lectures.* permissions.

CREATE TABLE IF NOT EXISTS sl_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES sl_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sl_folders_name_length CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT sl_folders_not_self CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE UNIQUE INDEX IF NOT EXISTS sl_folders_parent_name_unique
  ON sl_folders (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
CREATE INDEX IF NOT EXISTS sl_folders_parent_sort_idx
  ON sl_folders(parent_id, sort_order, lower(name));

-- current_version_id is added after sl_lecture_versions to avoid a circular
-- create-order dependency between lectures and their versions.
CREATE TABLE IF NOT EXISTS sl_lectures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID REFERENCES sl_folders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  current_version_id UUID,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sl_lectures_title_length CHECK (char_length(title) BETWEEN 1 AND 200)
);
CREATE INDEX IF NOT EXISTS sl_lectures_folder_updated_active_idx
  ON sl_lectures(folder_id, updated_at DESC) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS sl_lecture_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id UUID NOT NULL REFERENCES sl_lectures(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text/html',
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  note TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sl_lecture_versions_number_positive CHECK (version_no > 0),
  CONSTRAINT sl_lecture_versions_size_nonnegative CHECK (size_bytes >= 0),
  CONSTRAINT sl_lecture_versions_sha256_hex CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT sl_lecture_versions_lecture_number_unique UNIQUE (lecture_id, version_no)
);
CREATE INDEX IF NOT EXISTS sl_lecture_versions_lecture_idx
  ON sl_lecture_versions(lecture_id, version_no DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sl_lectures_current_version_fk'
      AND conrelid = 'sl_lectures'::regclass
  ) THEN
    ALTER TABLE sl_lectures
      ADD CONSTRAINT sl_lectures_current_version_fk
      FOREIGN KEY (current_version_id) REFERENCES sl_lecture_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS sl_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id UUID NOT NULL REFERENCES sl_lectures(id) ON DELETE CASCADE,
  pinned_version_id UUID REFERENCES sl_lecture_versions(id) ON DELETE SET NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_hint TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_email TEXT,
  recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  max_devices INTEGER NOT NULL DEFAULT 3,
  max_concurrent INTEGER NOT NULL DEFAULT 1,
  watermark_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  guard_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  revoke_reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sl_shares_token_hash_sha256 CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT sl_shares_token_hint_length CHECK (char_length(token_hint) = 4),
  CONSTRAINT sl_shares_recipient_name_present CHECK (char_length(recipient_name) > 0),
  CONSTRAINT sl_shares_expiry_after_start CHECK (expires_at > valid_from),
  CONSTRAINT sl_shares_max_devices_range CHECK (max_devices BETWEEN 1 AND 20),
  CONSTRAINT sl_shares_max_concurrent_range CHECK (
    max_concurrent BETWEEN 1 AND max_devices
  )
);
CREATE INDEX IF NOT EXISTS sl_shares_lecture_created_idx
  ON sl_shares(lecture_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sl_shares_expiry_active_idx
  ON sl_shares(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS sl_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID NOT NULL REFERENCES sl_shares(id) ON DELETE CASCADE,
  device_id UUID NOT NULL,
  fingerprint TEXT,
  label TEXT,
  user_agent TEXT,
  first_ip INET,
  last_ip INET,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  removed_at TIMESTAMPTZ,
  removed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  blocked_at TIMESTAMPTZ,
  blocked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sl_devices_share_device_unique UNIQUE (share_id, device_id)
);
CREATE INDEX IF NOT EXISTS sl_devices_share_active_idx
  ON sl_devices(share_id, last_seen_at DESC) WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS sl_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID NOT NULL REFERENCES sl_shares(id) ON DELETE CASCADE,
  device_ref UUID NOT NULL REFERENCES sl_devices(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES sl_lecture_versions(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMPTZ,
  end_reason TEXT,
  kicked_by_session_id UUID REFERENCES sl_sessions(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  ip INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sl_sessions_end_reason_valid CHECK (
    end_reason IS NULL OR end_reason IN (
      'closed', 'timeout', 'kicked', 'revoked', 'expired', 'device_removed'
    )
  )
);
CREATE INDEX IF NOT EXISTS sl_sessions_share_live_idx
  ON sl_sessions(share_id, last_heartbeat_at DESC) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS sl_sessions_device_live_idx
  ON sl_sessions(device_ref, last_heartbeat_at DESC) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS sl_access_logs (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lecture_id UUID REFERENCES sl_lectures(id) ON DELETE SET NULL,
  share_id UUID REFERENCES sl_shares(id) ON DELETE SET NULL,
  device_ref UUID REFERENCES sl_devices(id) ON DELETE SET NULL,
  session_id UUID REFERENCES sl_sessions(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  reason TEXT,
  ip INET,
  user_agent TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sl_access_logs_event_present CHECK (char_length(event) > 0)
);
CREATE INDEX IF NOT EXISTS sl_access_logs_share_at_idx
  ON sl_access_logs(share_id, at DESC);
CREATE INDEX IF NOT EXISTS sl_access_logs_lecture_at_idx
  ON sl_access_logs(lecture_id, at DESC);
CREATE INDEX IF NOT EXISTS sl_access_logs_session_at_idx
  ON sl_access_logs(session_id, at DESC);

WITH required_permissions(permission) AS (
  VALUES
    ('secure_lectures.view'),
    ('secure_lectures.manage'),
    ('secure_lectures.share')
)
UPDATE roles AS role
SET permissions = (
      SELECT jsonb_agg(permission ORDER BY permission)
      FROM (
        SELECT jsonb_array_elements_text(COALESCE(role.permissions, '[]'::jsonb)) AS permission
        UNION
        SELECT permission FROM required_permissions
      ) AS merged
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE role.slug = 'admin';
