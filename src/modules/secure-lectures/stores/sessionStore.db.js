const db = require('../../../config/db');
const { SessionStore } = require('./sessionStore');

class DbSessionStore extends SessionStore {
  constructor({ database = db } = {}) {
    super();
    this.database = database;
    this.kind = 'db';
  }

  async withClient(client, work) {
    return client ? work(client) : this.database.transaction(work);
  }

  async acquire(session, maxConcurrent, nowMs, ttlSec, { client = null } = {}) {
    return this.withClient(client, async connection => {
      await connection.query('SELECT id FROM sl_shares WHERE id = $1 FOR UPDATE', [session.shareId]);
      const cutoff = new Date(nowMs - ttlSec * 1000);
      await connection.query(`
        UPDATE sl_sessions SET ended_at = $2, end_reason = 'timeout', updated_at = $2
        WHERE share_id = $1 AND ended_at IS NULL AND last_heartbeat_at < $3`,
      [session.shareId, new Date(nowMs), cutoff]);
      const replacedResult = await connection.query(`
        UPDATE sl_sessions SET ended_at = $3, end_reason = 'closed', updated_at = $3
        WHERE share_id = $1 AND device_ref = $2 AND ended_at IS NULL RETURNING id`,
      [session.shareId, session.deviceRef, new Date(nowMs)]);
      const live = await this.listLive(session.shareId, nowMs, { client: connection, ttlSec });
      if (live.length >= maxConcurrent) {
        return {
          acquired: false,
          liveSessions: live,
          replaced: replacedResult.rows.map(row => row.id),
        };
      }
      await connection.query(`
        INSERT INTO sl_sessions
          (id, share_id, device_ref, version_id, started_at, last_heartbeat_at, ip, user_agent)
        VALUES ($1, $2, $3, $4, $5, $5, $6, $7)`, [
        session.id, session.shareId, session.deviceRef, session.versionId,
        new Date(nowMs), session.ip || null, session.userAgent || null,
      ]);
      return {
        acquired: true,
        session,
        durableCreated: true,
        replaced: replacedResult.rows.map(row => row.id),
      };
    });
  }

  async get(id, { client = this.database } = {}) {
    const result = await client.query(`
      SELECT ss.id, ss.share_id AS "shareId", ss.device_ref AS "deviceRef",
             d.device_id AS "deviceId", d.label AS "deviceLabel",
             ss.started_at AS "startedAt", ss.last_heartbeat_at AS "lastHeartbeatAt",
             CASE WHEN ss.ended_at IS NULL THEN 'active' ELSE ss.end_reason END AS status,
             ss.kicked_by_session_id AS "kickedBy"
      FROM sl_sessions ss JOIN sl_devices d ON d.id = ss.device_ref WHERE ss.id = $1`, [id]);
    return result.rows[0] || null;
  }

  async heartbeat(id, nowMs, _ttlSec, { client = this.database } = {}) {
    await client.query(`
      UPDATE sl_sessions SET last_heartbeat_at = $2, updated_at = $2
      WHERE id = $1 AND ended_at IS NULL RETURNING id`, [id, new Date(nowMs)]);
    return this.get(id, { client });
  }

  async kick(id, kickedBy = null, { client = this.database } = {}) {
    const result = await client.query(`
      UPDATE sl_sessions SET ended_at = CURRENT_TIMESTAMP, end_reason = 'kicked',
        kicked_by_session_id = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND ended_at IS NULL`, [id, kickedBy]);
    return result.rowCount > 0;
  }

  async end(id, reason = 'closed', { client = this.database } = {}) {
    const result = await client.query(`
      UPDATE sl_sessions SET ended_at = CURRENT_TIMESTAMP, end_reason = $2,
        updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND ended_at IS NULL`, [id, reason]);
    return result.rowCount > 0;
  }

  async listLive(shareId, nowMs = Date.now(), { client = this.database, ttlSec = 90 } = {}) {
    const result = await client.query(`
      SELECT ss.id, ss.share_id AS "shareId", ss.device_ref AS "deviceRef",
             d.device_id AS "deviceId", d.label AS "deviceLabel",
             ss.started_at AS "startedAt", ss.last_heartbeat_at AS "lastHeartbeatAt",
             'active' AS status
      FROM sl_sessions ss JOIN sl_devices d ON d.id = ss.device_ref
      WHERE ss.share_id = $1 AND ss.ended_at IS NULL AND ss.last_heartbeat_at >= $2
      ORDER BY ss.started_at`, [shareId, new Date(nowMs - ttlSec * 1000)]);
    return result.rows;
  }

  async endAllForShare(shareId, reason = 'closed', { client = this.database } = {}) {
    const result = await client.query(`
      UPDATE sl_sessions SET ended_at = CURRENT_TIMESTAMP, end_reason = $2,
        updated_at = CURRENT_TIMESTAMP WHERE share_id = $1 AND ended_at IS NULL`,
    [shareId, reason]);
    return result.rowCount;
  }

  async endAllForDevice(deviceRef, reason = 'device_removed', { client = this.database } = {}) {
    const result = await client.query(`
      UPDATE sl_sessions SET ended_at = CURRENT_TIMESTAMP, end_reason = $2,
        updated_at = CURRENT_TIMESTAMP WHERE device_ref = $1 AND ended_at IS NULL`,
    [deviceRef, reason]);
    return result.rowCount;
  }
}

function createDbSessionStore(options) { return new DbSessionStore(options); }
module.exports = { DbSessionStore, createDbSessionStore };
