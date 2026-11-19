const db = require('../../../config/db');

function mapLog(row) {
  return {
    id: String(row.id), at: row.at, lectureId: row.lecture_id,
    lectureTitle: row.lecture_title, shareId: row.share_id,
    recipientName: row.recipient_name, deviceRef: row.device_ref,
    deviceLabel: row.device_label, sessionId: row.session_id,
    actorUserId: row.actor_user_id, actorName: row.actor_name,
    event: row.event, reason: row.reason, ip: row.ip,
    userAgent: row.user_agent, meta: row.meta || {},
  };
}

function createLogRepository({ database = db } = {}) {
  async function list({ lectureId, shareId, event, denied, from, to, beforeId, limit }) {
    const params = [];
    const where = [];
    const add = (value, cast) => { params.push(value); return `$${params.length}::${cast}`; };
    if (lectureId) where.push(`al.lecture_id = ${add(lectureId, 'uuid')}`);
    if (shareId) where.push(`al.share_id = ${add(shareId, 'uuid')}`);
    if (denied) where.push("al.event = 'open_denied'");
    else if (event) where.push(`al.event = ${add(event, 'text')}`);
    if (from) where.push(`al.at >= ${add(from, 'timestamptz')}`);
    if (to) where.push(`al.at <= ${add(to, 'timestamptz')}`);
    if (beforeId) where.push(`al.id < ${add(beforeId, 'bigint')}`);
    const limitSql = add(limit + 1, 'int');
    const result = await database.query(`
      SELECT al.id, al.at, al.lecture_id, al.share_id, al.device_ref, al.session_id,
             al.actor_user_id, al.event, al.reason, host(al.ip) AS ip,
             al.user_agent, al.meta, l.title AS lecture_title, s.recipient_name,
             d.label AS device_label, COALESCE(u.name, u.username) AS actor_name
      FROM sl_access_logs al
      LEFT JOIN sl_lectures l ON l.id = al.lecture_id
      LEFT JOIN sl_shares s ON s.id = al.share_id
      LEFT JOIN sl_devices d ON d.id = al.device_ref
      LEFT JOIN users u ON u.id = al.actor_user_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY al.id DESC
      LIMIT ${limitSql}`, params);
    return result.rows.map(mapLog);
  }
  return { list };
}

module.exports = { createLogRepository, mapLog };
