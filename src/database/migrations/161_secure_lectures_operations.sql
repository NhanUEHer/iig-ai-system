CREATE INDEX IF NOT EXISTS sl_access_logs_event_reason_at_idx
  ON sl_access_logs(event, reason, at DESC);

CREATE INDEX IF NOT EXISTS sl_access_logs_at_id_idx
  ON sl_access_logs(at DESC, id DESC);

CREATE INDEX IF NOT EXISTS sl_lectures_archived_at_idx
  ON sl_lectures(archived_at) WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS sl_shares_active_expiry_idx
  ON sl_shares(lecture_id, expires_at) WHERE revoked_at IS NULL;
