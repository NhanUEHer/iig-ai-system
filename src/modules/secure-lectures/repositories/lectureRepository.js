const db = require('../../../config/db');

function mapCurrentVersion(row) {
  if (!row?.current_version_id) return null;
  return {
    id: row.current_version_id,
    versionNo: Number(row.current_version_no),
    size: Number(row.current_version_size),
    originalFilename: row.current_version_filename,
    meta: row.current_version_meta || {},
  };
}

function mapLecture(row) {
  if (!row) return null;
  const rawSummary = row.share_status_summary || {};
  return {
    id: row.id,
    folderId: row.folder_id,
    title: row.title,
    description: row.description,
    currentVersion: mapCurrentVersion(row),
    activeShareCount: Number(row.active_share_count || 0),
    shareStatusSummary: {
      active: Number(rawSummary.active || 0),
      scheduled: Number(rawSummary.scheduled || 0),
      expired: Number(rawSummary.expired || 0),
      revoked: Number(rawSummary.revoked || 0),
    },
    registeredDeviceCount: Number(row.registered_device_count || 0),
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ? {
      id: row.updated_by,
      name: row.updated_by_name || null,
    } : null,
  };
}

const SELECT_LECTURE = `
  SELECT l.*,
         v.version_no AS current_version_no,
         v.size_bytes AS current_version_size,
         v.original_filename AS current_version_filename,
         v.meta AS current_version_meta,
         COALESCE(u.name, u.username) AS updated_by_name,
         (SELECT COUNT(*)::int FROM sl_shares s
          WHERE s.lecture_id = l.id AND s.revoked_at IS NULL
            AND s.valid_from <= CURRENT_TIMESTAMP AND s.expires_at > CURRENT_TIMESTAMP) AS active_share_count,
         (SELECT COUNT(*)::int
          FROM sl_devices d JOIN sl_shares s ON s.id = d.share_id
          WHERE s.lecture_id = l.id AND d.removed_at IS NULL) AS registered_device_count,
         jsonb_build_object(
           'active', (SELECT COUNT(*)::int FROM sl_shares s WHERE s.lecture_id = l.id AND s.revoked_at IS NULL AND s.valid_from <= CURRENT_TIMESTAMP AND s.expires_at > CURRENT_TIMESTAMP),
           'scheduled', (SELECT COUNT(*)::int FROM sl_shares s WHERE s.lecture_id = l.id AND s.revoked_at IS NULL AND s.valid_from > CURRENT_TIMESTAMP),
           'expired', (SELECT COUNT(*)::int FROM sl_shares s WHERE s.lecture_id = l.id AND s.revoked_at IS NULL AND s.expires_at <= CURRENT_TIMESTAMP),
           'revoked', (SELECT COUNT(*)::int FROM sl_shares s WHERE s.lecture_id = l.id AND s.revoked_at IS NOT NULL)
         ) AS share_status_summary
  FROM sl_lectures l
  LEFT JOIN sl_lecture_versions v ON v.id = l.current_version_id
  LEFT JOIN users u ON u.id = l.updated_by`;

function createLectureRepository({ database = db } = {}) {
  async function folderExists(client, id) {
    const result = await client.query('SELECT 1 FROM sl_folders WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  async function insert(client, { title, description, folderId, userId }) {
    const result = await client.query(`
      INSERT INTO sl_lectures (folder_id, title, description, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $4)
      RETURNING id`, [folderId, title, description, userId]);
    return result.rows[0].id;
  }

  async function findById(id, client = database, { includeArchived = false } = {}) {
    const result = await client.query(`
      ${SELECT_LECTURE}
      WHERE l.id = $1 ${includeArchived ? '' : 'AND l.archived_at IS NULL'}`, [id]);
    return mapLecture(result.rows[0]);
  }

  async function list({ folderId, includeSubfolders, q, status, sort, limit, offset }) {
    const params = [];
    const where = ['l.archived_at IS NULL'];
    if (folderId === 'unfiled') {
      where.push('l.folder_id IS NULL');
    } else if (folderId && folderId !== 'all') {
      params.push(folderId);
      if (includeSubfolders) {
        where.push(`l.folder_id IN (
          WITH RECURSIVE tree AS (
            SELECT id FROM sl_folders WHERE id = $${params.length}
            UNION ALL SELECT f.id FROM sl_folders f JOIN tree t ON f.parent_id = t.id
          ) SELECT id FROM tree)`);
      } else {
        where.push(`l.folder_id = $${params.length}`);
      }
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`l.title ILIKE $${params.length}`);
    }

    const activeShare = `EXISTS (SELECT 1 FROM sl_shares fs WHERE fs.lecture_id = l.id
      AND fs.revoked_at IS NULL AND fs.valid_from <= CURRENT_TIMESTAMP AND fs.expires_at > CURRENT_TIMESTAMP)`;
    if (status === 'shared') where.push(activeShare);
    if (status === 'unshared') where.push(`NOT ${activeShare}`);
    if (status === 'expiring') where.push(`EXISTS (SELECT 1 FROM sl_shares fs WHERE fs.lecture_id = l.id
      AND fs.revoked_at IS NULL AND fs.valid_from <= CURRENT_TIMESTAMP
      AND fs.expires_at > CURRENT_TIMESTAMP AND fs.expires_at <= CURRENT_TIMESTAMP + INTERVAL '3 days')`);
    if (status === 'attention') where.push(`(
      EXISTS (SELECT 1 FROM sl_shares fs WHERE fs.lecture_id = l.id AND fs.revoked_at IS NULL
        AND fs.expires_at > CURRENT_TIMESTAMP AND fs.expires_at <= CURRENT_TIMESTAMP + INTERVAL '3 days')
      OR EXISTS (SELECT 1 FROM sl_devices d JOIN sl_shares fs ON fs.id = d.share_id
        WHERE fs.lecture_id = l.id AND d.blocked_at IS NOT NULL)
      OR EXISTS (SELECT 1 FROM sl_access_logs al WHERE al.lecture_id = l.id
        AND al.event = 'open_denied' AND al.reason = 'DEVICE_LIMIT'
        AND al.at >= CURRENT_TIMESTAMP - INTERVAL '7 days'))`);

    const orders = {
      updated_desc: 'l.updated_at DESC, l.id DESC',
      updated_asc: 'l.updated_at ASC, l.id ASC',
      title_asc: 'lower(l.title) ASC, l.id ASC',
      title_desc: 'lower(l.title) DESC, l.id DESC',
      created_desc: 'l.created_at DESC, l.id DESC',
      created_asc: 'l.created_at ASC, l.id ASC',
    };
    params.push(limit + 1);
    const limitIndex = params.length;
    params.push(offset);
    const offsetIndex = params.length;
    const result = await database.query(`
      ${SELECT_LECTURE}
      WHERE ${where.join(' AND ')}
      ORDER BY ${orders[sort] || orders.updated_desc}
      LIMIT $${limitIndex} OFFSET $${offsetIndex}`, params);
    return result.rows.map(mapLecture);
  }

  async function update(id, changes, userId, client = database) {
    const params = [id];
    const sets = [];
    for (const [column, value] of Object.entries(changes)) {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    }
    params.push(userId);
    const result = await client.query(`
      UPDATE sl_lectures
      SET ${sets.join(', ')}, updated_by = $${params.length}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND archived_at IS NULL
      RETURNING id`, params);
    return result.rowCount > 0;
  }

  async function move(client, ids, folderId, userId) {
    const locked = await client.query(`
      SELECT id FROM sl_lectures
      WHERE id = ANY($1::uuid[]) AND archived_at IS NULL
      FOR UPDATE`, [ids]);
    if (locked.rowCount !== ids.length) return null;
    const result = await client.query(`
      UPDATE sl_lectures
      SET folder_id = $2, updated_by = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = ANY($1::uuid[]) AND archived_at IS NULL
      RETURNING id`, [ids, folderId, userId]);
    return result.rows.map(row => row.id);
  }

  async function archive(id, userId) {
    const result = await database.query(`
      UPDATE sl_lectures
      SET archived_at = CURRENT_TIMESTAMP, updated_by = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND archived_at IS NULL
      RETURNING id, archived_at`, [id, userId]);
    return result.rows[0] || null;
  }

  async function overview({ folderId = 'all', includeSubfolders = true } = {}) {
    const params = [];
    let folderFilter = '';
    if (folderId === 'unfiled') {
      folderFilter = 'AND folder_id IS NULL';
    } else if (folderId && folderId !== 'all') {
      params.push(folderId);
      folderFilter = includeSubfolders
        ? `AND folder_id IN (
            WITH RECURSIVE tree AS (
              SELECT id FROM sl_folders WHERE id = $1
              UNION ALL SELECT f.id FROM sl_folders f JOIN tree t ON f.parent_id = t.id
            ) SELECT id FROM tree)`
        : 'AND folder_id = $1';
    }
    const result = await database.query(`
      WITH scoped_lectures AS (
        SELECT id FROM sl_lectures
        WHERE archived_at IS NULL ${folderFilter}
      ), active_shares AS (
        SELECT s.* FROM sl_shares s
        JOIN scoped_lectures l ON l.id = s.lecture_id
        WHERE s.revoked_at IS NULL
          AND s.valid_from <= CURRENT_TIMESTAMP
          AND s.expires_at > CURRENT_TIMESTAMP
      )
      SELECT
        (SELECT COUNT(*)::int FROM scoped_lectures) AS total_lectures,
        (SELECT COUNT(*)::int FROM active_shares) AS active_share_count,
        (SELECT COUNT(DISTINCT lower(recipient_name))::int FROM active_shares)
          AS unique_recipient_count,
        (SELECT COUNT(*)::int FROM active_shares s
         WHERE s.expires_at <= CURRENT_TIMESTAMP + INTERVAL '3 days'
            OR EXISTS (
              SELECT 1 FROM sl_devices d
              WHERE d.share_id = s.id AND d.blocked_at IS NOT NULL
            )) AS attention_count`, params);
    return {
      totalLectures: Number(result.rows[0]?.total_lectures || 0),
      activeShareCount: Number(result.rows[0]?.active_share_count || 0),
      uniqueRecipientCount: Number(result.rows[0]?.unique_recipient_count || 0),
      liveSessionCount: 0,
      attentionCount: Number(result.rows[0]?.attention_count || 0),
    };
  }

  return {
    transaction: work => database.transaction(work),
    folderExists,
    insert,
    findById,
    list,
    update,
    move,
    archive,
    overview,
  };
}

module.exports = { createLectureRepository, mapLecture, SELECT_LECTURE };
