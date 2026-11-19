const db = require('../../../config/db');

const SHARE_COLUMNS = `
  s.id, s.lecture_id, s.pinned_version_id, s.token_hint,
  s.recipient_name, s.recipient_email, s.recipient_user_id,
  s.valid_from, s.expires_at, s.max_devices, s.max_concurrent,
  s.watermark_enabled, s.guard_enabled, s.note,
  s.revoked_at, s.revoked_by, s.revoke_reason,
  s.created_by, s.updated_by, s.created_at, s.updated_at`;

function createShareRepository({ database = db } = {}) {
  async function create(client, input) {
    const result = await client.query(`
      INSERT INTO sl_shares
        (lecture_id, pinned_version_id, token_hash, token_hint, recipient_name,
         recipient_email, valid_from, expires_at, max_devices, max_concurrent,
         watermark_enabled, guard_enabled, note, created_by, updated_by)
      SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14
      WHERE EXISTS (
        SELECT 1 FROM sl_lectures l
        WHERE l.id = $1 AND l.archived_at IS NULL AND l.current_version_id IS NOT NULL
          AND ($2::uuid IS NULL OR EXISTS (
            SELECT 1 FROM sl_lecture_versions v WHERE v.id = $2 AND v.lecture_id = l.id
          ))
      )
      RETURNING *`, [
      input.lectureId,
      input.pinnedVersionId,
      input.tokenHash,
      input.tokenHint,
      input.recipientName,
      input.recipientEmail,
      input.validFrom,
      input.expiresAt,
      input.maxDevices,
      input.maxConcurrent,
      input.watermarkEnabled,
      input.guardEnabled,
      input.note,
      input.userId,
    ]);
    return result.rows[0] || null;
  }

  async function findById(id, client = database) {
    const result = await client.query(`
      SELECT ${SHARE_COLUMNS},
             (SELECT COUNT(*)::int FROM sl_devices d
              WHERE d.share_id = s.id AND d.removed_at IS NULL) AS device_count,
             (SELECT COUNT(*)::int FROM sl_sessions ss
              WHERE ss.share_id = s.id AND ss.ended_at IS NULL) AS live_session_count
      FROM sl_shares s WHERE s.id = $1`, [id]);
    return result.rows[0] || null;
  }

  async function list(lectureId) {
    const result = await database.query(`
      SELECT ${SHARE_COLUMNS},
             (SELECT COUNT(*)::int FROM sl_devices d
              WHERE d.share_id = s.id AND d.removed_at IS NULL) AS device_count,
             (SELECT COUNT(*)::int FROM sl_sessions ss
              WHERE ss.share_id = s.id AND ss.ended_at IS NULL) AS live_session_count
      FROM sl_shares s
      WHERE s.lecture_id = $1
      ORDER BY s.created_at DESC, s.id DESC`, [lectureId]);
    return result.rows;
  }

  async function update(client, id, changes, userId) {
    const columns = {
      recipientName: 'recipient_name',
      recipientEmail: 'recipient_email',
      pinnedVersionId: 'pinned_version_id',
      validFrom: 'valid_from',
      expiresAt: 'expires_at',
      maxDevices: 'max_devices',
      maxConcurrent: 'max_concurrent',
      watermarkEnabled: 'watermark_enabled',
      guardEnabled: 'guard_enabled',
      note: 'note',
    };
    const params = [id];
    const sets = [];
    for (const [field, column] of Object.entries(columns)) {
      if (!Object.hasOwn(changes, field)) continue;
      params.push(changes[field]);
      sets.push(`${column} = $${params.length}`);
    }
    params.push(userId);
    const result = await client.query(`
      UPDATE sl_shares
      SET ${sets.join(', ')}, updated_by = $${params.length}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *`, params);
    return result.rows[0] || null;
  }

  async function pinnedVersionBelongsToLecture(client, lectureId, versionId) {
    if (versionId === null) return true;
    const result = await client.query(
      'SELECT 1 FROM sl_lecture_versions WHERE id = $1 AND lecture_id = $2',
      [versionId, lectureId],
    );
    return result.rowCount > 0;
  }

  async function revoke(client, id, reason, userId) {
    const result = await client.query(`
      UPDATE sl_shares
      SET revoked_at = CURRENT_TIMESTAMP, revoked_by = $2, revoke_reason = $3,
          updated_by = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND revoked_at IS NULL
      RETURNING *`, [id, userId, reason]);
    return result.rows[0] || null;
  }

  async function endSessionsForShare(client, shareId, reason) {
    await client.query(`
      UPDATE sl_sessions
      SET ended_at = CURRENT_TIMESTAMP, end_reason = $2, updated_at = CURRENT_TIMESTAMP
      WHERE share_id = $1 AND ended_at IS NULL`, [shareId, reason]);
  }

  async function listDevices(shareId) {
    const result = await database.query(`
      SELECT d.*,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                 'id', ss.id,
                 'startedAt', ss.started_at,
                 'lastHeartbeatAt', ss.last_heartbeat_at
               ) ORDER BY ss.started_at DESC)
               FROM sl_sessions ss
               WHERE ss.device_ref = d.id AND ss.ended_at IS NULL
             ), '[]'::jsonb) AS live_sessions
      FROM sl_devices d
      WHERE d.share_id = $1
      ORDER BY d.last_seen_at DESC, d.id DESC`, [shareId]);
    return result.rows;
  }

  async function mutateDevice(client, shareId, deviceRef, action, userId) {
    const mutations = {
      remove: 'removed_at = CURRENT_TIMESTAMP, removed_by = $3',
      block: 'blocked_at = CURRENT_TIMESTAMP, blocked_by = $3',
      unblock: 'blocked_at = NULL, blocked_by = NULL',
    };
    const result = await client.query(`
      UPDATE sl_devices
      SET ${mutations[action]}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND share_id = $1
      RETURNING *`, action === 'unblock'
      ? [shareId, deviceRef]
      : [shareId, deviceRef, userId]);
    return result.rows[0] || null;
  }

  async function endSessionsForDevice(client, deviceRef) {
    await client.query(`
      UPDATE sl_sessions
      SET ended_at = CURRENT_TIMESTAMP, end_reason = 'device_removed',
          updated_at = CURRENT_TIMESTAMP
      WHERE device_ref = $1 AND ended_at IS NULL`, [deviceRef]);
  }

  async function log(client, { lectureId, shareId, deviceRef = null, userId, event, meta = {} }) {
    await client.query(`
      INSERT INTO sl_access_logs
        (lecture_id, share_id, device_ref, actor_user_id, event, meta)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)`, [
      lectureId, shareId, deviceRef, userId, event, JSON.stringify(meta),
    ]);
  }

  return {
    transaction: work => database.transaction(work),
    create,
    findById,
    list,
    update,
    pinnedVersionBelongsToLecture,
    revoke,
    endSessionsForShare,
    listDevices,
    mutateDevice,
    endSessionsForDevice,
    log,
  };
}

module.exports = { createShareRepository, SHARE_COLUMNS };
