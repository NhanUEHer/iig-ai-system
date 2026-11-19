const db = require('../../../config/db');

function createAccessRepository({ database = db } = {}) {
  async function lockShareByToken(client, tokenHash) {
    const result = await client.query(`
      SELECT s.*, l.title AS lecture_title, l.archived_at,
             COALESCE(s.pinned_version_id, l.current_version_id) AS version_id
      FROM sl_shares s JOIN sl_lectures l ON l.id = s.lecture_id
      WHERE s.token_hash = $1 FOR UPDATE OF s`, [tokenHash]);
    return result.rows[0] || null;
  }

  async function findDevice(client, shareId, deviceId) {
    const result = await client.query(
      'SELECT * FROM sl_devices WHERE share_id = $1 AND device_id = $2 FOR UPDATE',
      [shareId, deviceId],
    );
    return result.rows[0] || null;
  }

  async function activeDeviceCount(client, shareId) {
    const result = await client.query(
      'SELECT COUNT(*)::int AS count FROM sl_devices WHERE share_id = $1 AND removed_at IS NULL',
      [shareId],
    );
    return Number(result.rows[0]?.count || 0);
  }

  async function registerDevice(client, input) {
    const result = input.existingId
      ? await client.query(`
          UPDATE sl_devices SET fingerprint = $2, label = $3, user_agent = $4,
            last_ip = $5, last_seen_at = $6, removed_at = NULL, removed_by = NULL,
            updated_at = $6 WHERE id = $1 RETURNING *`, [
        input.existingId, input.fingerprint, input.label, input.userAgent,
        input.ip, input.now,
      ])
      : await client.query(`
          INSERT INTO sl_devices
            (share_id, device_id, fingerprint, label, user_agent, first_ip, last_ip,
             first_seen_at, last_seen_at)
          VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $7) RETURNING *`, [
        input.shareId, input.deviceId, input.fingerprint, input.label,
        input.userAgent, input.ip, input.now,
      ]);
    return result.rows[0];
  }

  async function touchDevice(client, id, { fingerprint, label, userAgent, ip, now }) {
    const result = await client.query(`
      UPDATE sl_devices SET fingerprint = COALESCE($2, fingerprint), label = $3,
        user_agent = $4, last_ip = $5, last_seen_at = $6, updated_at = $6
      WHERE id = $1 RETURNING *`, [id, fingerprint, label, userAgent, ip, now]);
    return result.rows[0];
  }

  async function insertSession(client, session) {
    await client.query(`
      INSERT INTO sl_sessions
        (id, share_id, device_ref, version_id, started_at, last_heartbeat_at, ip, user_agent)
      VALUES ($1, $2, $3, $4, $5, $5, $6, $7)`, [
      session.id, session.shareId, session.deviceRef, session.versionId,
      session.startedAt, session.ip, session.userAgent,
    ]);
  }

  async function reserveSession(client, session, maxConcurrent, now, ttlSec) {
    const cutoff = new Date(now.getTime() - ttlSec * 1000);
    await client.query(`
      UPDATE sl_sessions SET ended_at = $2, end_reason = 'timeout', updated_at = $2
      WHERE share_id = $1 AND ended_at IS NULL AND last_heartbeat_at < $3`,
    [session.shareId, now, cutoff]);
    await client.query(`
      UPDATE sl_sessions SET ended_at = $3, end_reason = 'closed', updated_at = $3
      WHERE share_id = $1 AND device_ref = $2 AND ended_at IS NULL`,
    [session.shareId, session.deviceRef, now]);
    const live = await client.query(`
      SELECT ss.id, d.label AS "deviceLabel", ss.started_at AS "startedAt"
      FROM sl_sessions ss JOIN sl_devices d ON d.id = ss.device_ref
      WHERE ss.share_id = $1 AND ss.ended_at IS NULL
        AND ss.last_heartbeat_at >= $2 ORDER BY ss.started_at`, [session.shareId, cutoff]);
    if (live.rowCount >= maxConcurrent) {
      return { acquired: false, liveSessions: live.rows };
    }
    await insertSession(client, session);
    return { acquired: true };
  }

  async function endSessions(client, ids, reason = 'closed') {
    if (!ids?.length) return 0;
    const result = await client.query(`
      UPDATE sl_sessions SET ended_at = CURRENT_TIMESTAMP, end_reason = $2,
        updated_at = CURRENT_TIMESTAMP WHERE id = ANY($1::uuid[]) AND ended_at IS NULL`,
    [ids, reason]);
    return result.rowCount;
  }

  async function sessionContext(id, client = database) {
    const result = await client.query(`
      SELECT ss.*, s.lecture_id, s.revoked_at, s.expires_at,
             l.archived_at AS lecture_archived_at,
             d.device_id, d.removed_at, d.blocked_at
      FROM sl_sessions ss
      JOIN sl_shares s ON s.id = ss.share_id
      JOIN sl_lectures l ON l.id = s.lecture_id
      JOIN sl_devices d ON d.id = ss.device_ref
      WHERE ss.id = $1`, [id]);
    return result.rows[0] || null;
  }

  async function touchDurableSession(id, now, force = false, throttleSec = 120) {
    const result = await database.query(`
      UPDATE sl_sessions SET last_heartbeat_at = $2, updated_at = $2
      WHERE id = $1 AND ended_at IS NULL
        AND ($3::boolean OR last_heartbeat_at <= $2::timestamptz - make_interval(secs => $4::int))`,
    [id, now, force, throttleSec]);
    return result.rowCount > 0;
  }

  async function endSession(id, reason, kickedBy = null, client = database) {
    const result = await client.query(`
      UPDATE sl_sessions SET ended_at = CURRENT_TIMESTAMP, end_reason = $2,
        kicked_by_session_id = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND ended_at IS NULL RETURNING *`, [id, reason, kickedBy]);
    return result.rows[0] || null;
  }

  async function log(client, entry) {
    await client.query(`
      INSERT INTO sl_access_logs
        (lecture_id, share_id, device_ref, session_id, actor_user_id,
         event, reason, ip, user_agent, meta)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`, [
      entry.lectureId || null, entry.shareId || null, entry.deviceRef || null,
      entry.sessionId || null, entry.userId || null, entry.event, entry.reason || null,
      entry.ip || null, entry.userAgent || null, JSON.stringify(entry.meta || {}),
    ]);
  }

  return {
    transaction: work => database.transaction(work),
    lockShareByToken,
    findDevice,
    activeDeviceCount,
    registerDevice,
    touchDevice,
    insertSession,
    reserveSession,
    endSessions,
    sessionContext,
    touchDurableSession,
    endSession,
    log,
  };
}

module.exports = { createAccessRepository };
