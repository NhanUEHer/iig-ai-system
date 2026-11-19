const db = require('../../../config/db');

function mapFolder(row) {
  if (!row) return null;
  return {
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
    sortOrder: Number(row.sort_order),
    lectureCount: Number(row.lecture_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createFolderRepository({ database = db } = {}) {
  async function list() {
    const [folders, unfiled] = await Promise.all([
      database.query(`
        SELECT f.*,
               COUNT(l.id) FILTER (WHERE l.archived_at IS NULL)::int AS lecture_count
        FROM sl_folders f
        LEFT JOIN sl_lectures l ON l.folder_id = f.id
        GROUP BY f.id
        ORDER BY f.sort_order, lower(f.name), f.id`),
      database.query(`
        SELECT COUNT(*)::int AS count
        FROM sl_lectures
        WHERE folder_id IS NULL AND archived_at IS NULL`),
    ]);
    return {
      folders: folders.rows.map(mapFolder),
      unfiledCount: Number(unfiled.rows[0]?.count || 0),
    };
  }

  async function findForUpdate(client, id) {
    const result = await client.query('SELECT * FROM sl_folders WHERE id = $1 FOR UPDATE', [id]);
    return mapFolder(result.rows[0]);
  }

  async function exists(client, id) {
    const result = await client.query('SELECT 1 FROM sl_folders WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  async function ancestorDepth(client, id) {
    const result = await client.query(`
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_id, 1 AS depth FROM sl_folders WHERE id = $1
        UNION ALL
        SELECT f.id, f.parent_id, a.depth + 1
        FROM sl_folders f JOIN ancestors a ON f.id = a.parent_id
        WHERE a.depth < 100
      )
      SELECT COALESCE(MAX(depth), 0)::int AS depth FROM ancestors`, [id]);
    return Number(result.rows[0]?.depth || 0);
  }

  async function subtreeHeight(client, id) {
    const result = await client.query(`
      WITH RECURSIVE descendants AS (
        SELECT id, 1 AS depth FROM sl_folders WHERE id = $1
        UNION ALL
        SELECT f.id, d.depth + 1
        FROM sl_folders f JOIN descendants d ON f.parent_id = d.id
        WHERE d.depth < 100
      )
      SELECT COALESCE(MAX(depth), 0)::int AS height FROM descendants`, [id]);
    return Number(result.rows[0]?.height || 0);
  }

  async function isDescendant(client, candidateId, folderId) {
    const result = await client.query(`
      WITH RECURSIVE descendants AS (
        SELECT id FROM sl_folders WHERE id = $1
        UNION ALL
        SELECT f.id FROM sl_folders f JOIN descendants d ON f.parent_id = d.id
      )
      SELECT 1 FROM descendants WHERE id = $2`, [folderId, candidateId]);
    return result.rowCount > 0;
  }

  async function insert(client, { name, parentId, userId }) {
    const result = await client.query(`
      INSERT INTO sl_folders (parent_id, name, sort_order, created_by, updated_by)
      VALUES (
        $1, $2,
        COALESCE((SELECT MAX(sort_order) + 1 FROM sl_folders WHERE parent_id IS NOT DISTINCT FROM $1), 0),
        $3, $3
      )
      RETURNING *`, [parentId, name, userId]);
    return mapFolder(result.rows[0]);
  }

  async function update(client, id, { name, parentId, sortOrder, userId }) {
    const result = await client.query(`
      UPDATE sl_folders
      SET name = $2, parent_id = $3, sort_order = $4, updated_by = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *`, [id, name, parentId, sortOrder, userId]);
    return mapFolder(result.rows[0]);
  }

  async function remove(client, id) {
    const result = await client.query('DELETE FROM sl_folders WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  return {
    transaction: work => database.transaction(work),
    list,
    findForUpdate,
    exists,
    ancestorDepth,
    subtreeHeight,
    isDescendant,
    insert,
    update,
    remove,
  };
}

module.exports = { createFolderRepository, mapFolder };
