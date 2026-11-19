const db = require('../../../config/db');

function createMaintenanceRepository({ database = db } = {}) {
  async function closeStaleSessions(ttlSec) {
    const result = await database.query(`
      UPDATE sl_sessions
      SET ended_at = CURRENT_TIMESTAMP, end_reason = 'timeout', updated_at = CURRENT_TIMESTAMP
      WHERE ended_at IS NULL
        AND last_heartbeat_at < CURRENT_TIMESTAMP - make_interval(secs => $1::int)
      RETURNING id`, [ttlSec]);
    return result.rowCount;
  }

  async function deleteExpiredLogs(retentionDays) {
    const result = await database.query(`
      DELETE FROM sl_access_logs
      WHERE at < CURRENT_TIMESTAMP - make_interval(days => $1::int)`, [retentionDays]);
    return result.rowCount;
  }

  async function listArchivedVersions(archiveDays, limit = 500) {
    const result = await database.query(`
      SELECT v.id, v.lecture_id, v.storage_key
      FROM sl_lecture_versions v
      JOIN sl_lectures l ON l.id = v.lecture_id
      WHERE l.archived_at < CURRENT_TIMESTAMP - make_interval(days => $1::int)
      ORDER BY l.archived_at, v.id
      LIMIT $2::int`, [archiveDays, limit]);
    return result.rows;
  }

  async function deleteArchivedVersion(versionId, lectureId, archiveDays) {
    return database.transaction(async client => {
      await client.query(`
        UPDATE sl_lectures
        SET current_version_id = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid AND current_version_id = $2::uuid
          AND archived_at < CURRENT_TIMESTAMP - make_interval(days => $3::int)`,
      [lectureId, versionId, archiveDays]);
      const result = await client.query(`
        DELETE FROM sl_lecture_versions v
        USING sl_lectures l
        WHERE v.id = $1::uuid AND v.lecture_id = $2::uuid
          AND l.id = v.lecture_id
          AND l.archived_at < CURRENT_TIMESTAMP - make_interval(days => $3::int)`,
      [versionId, lectureId, archiveDays]);
      return result.rowCount > 0;
    });
  }

  return { closeStaleSessions, deleteExpiredLogs, listArchivedVersions, deleteArchivedVersion };
}

module.exports = { createMaintenanceRepository };
