const db = require('../../../config/db');

function createContentRepository({ database = db } = {}) {
  async function findDelivery({ sessionId, versionId, deviceId }) {
    const result = await database.query(`
      SELECT v.id AS version_id, v.storage_key, v.sha256,
             s.id AS share_id, s.lecture_id, s.recipient_name,
             s.watermark_enabled, s.guard_enabled,
             d.id AS device_ref
      FROM sl_sessions ss
      JOIN sl_shares s ON s.id = ss.share_id
      JOIN sl_devices d ON d.id = ss.device_ref
      JOIN sl_lecture_versions v ON v.id = ss.version_id
      JOIN sl_lectures l ON l.id = s.lecture_id
      WHERE ss.id = $1::uuid
        AND v.id = $2::uuid
        AND d.device_id = $3::uuid
        AND ss.ended_at IS NULL
        AND s.revoked_at IS NULL
        AND s.valid_from <= CURRENT_TIMESTAMP
        AND s.expires_at > CURRENT_TIMESTAMP
        AND d.removed_at IS NULL
        AND d.blocked_at IS NULL
        AND l.archived_at IS NULL`, [sessionId, versionId, deviceId]);
    return result.rows[0] || null;
  }

  async function findPreview(lectureId, versionId) {
    const result = await database.query(`
      SELECT v.id AS version_id, v.storage_key, v.sha256, l.id AS lecture_id
      FROM sl_lecture_versions v
      JOIN sl_lectures l ON l.id = v.lecture_id
      WHERE l.id = $1::uuid AND v.id = $2::uuid AND l.archived_at IS NULL`,
    [lectureId, versionId]);
    return result.rows[0] || null;
  }

  async function logOpen(delivery, sessionId, context = {}) {
    await database.query(`
      INSERT INTO sl_access_logs
        (lecture_id, share_id, device_ref, session_id, event, ip, user_agent, meta)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'open_ok',
              $5::inet, $6::text, $7::jsonb)`, [
      delivery.lecture_id,
      delivery.share_id,
      delivery.device_ref,
      sessionId,
      context.ip || null,
      context.userAgent || null,
      JSON.stringify({ versionId: delivery.version_id }),
    ]);
  }

  return { findDelivery, findPreview, logOpen };
}

module.exports = { createContentRepository };
