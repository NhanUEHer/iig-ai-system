const db = require('../../config/db');

const map = row => row && ({
  id: row.id,
  code: row.code,
  name: row.title,
  description: row.description || '',
  status: row.status,
  questionCount: Number(row.question_count || 0),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

function filters({ search = '', statuses = '' } = {}) {
  const where = [];
  const params = [];
  if (String(search).trim()) {
    params.push(`%${String(search).trim()}%`);
    where.push(`(g.title ILIKE $${params.length} OR g.code ILIKE $${params.length})`);
  }
  const selectedStatuses = [...new Set(String(statuses || '').split(',').map(item => item.trim()).filter(Boolean))];
  if (selectedStatuses.length) {
    params.push(selectedStatuses);
    where.push(`g.status = ANY($${params.length}::text[])`);
  }
  return { params, where: where.length ? `WHERE ${where.join(' AND ')}` : '' };
}

async function list(query = {}) {
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  const page = Math.max(Number(query.page) || 1, 1);
  const { params, where } = filters(query);
  const count = await db.query(`SELECT COUNT(*)::int AS total FROM question_groups g ${where}`, params);
  const total = count.rows[0].total;
  const rows = await db.query(`
    SELECT g.*, COUNT(q.id)::int AS question_count
    FROM question_groups g
    LEFT JOIN question_bank_questions q ON q.group_id = g.id
    ${where}
    GROUP BY g.id
    ORDER BY g.updated_at DESC, g.title ASC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, limit, (page - 1) * limit]);
  return { data: rows.rows.map(map), meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

async function find(id) {
  const result = await db.query(`SELECT g.*, COUNT(q.id)::int AS question_count FROM question_groups g LEFT JOIN question_bank_questions q ON q.group_id=g.id WHERE g.id=$1 GROUP BY g.id`, [id]);
  return map(result.rows[0]);
}

async function countActiveQuestions(id) {
  const result = await db.query("SELECT COUNT(*)::int AS total FROM question_bank_questions WHERE group_id=$1 AND status='ACTIVE'", [id]);
  return Number(result.rows[0]?.total || 0);
}

async function nextCode() {
  const result = await db.query("SELECT 'GRP-' || LPAD(nextval('question_group_code_seq')::text, 2, '0') AS code");
  return result.rows[0].code;
}

async function create(data, userId) {
  const code = await nextCode();
  const result = await db.query(`INSERT INTO question_groups(code,title,description,status,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5) RETURNING id`, [code, data.name.trim(), data.description?.trim() || null, data.status || 'DRAFT', userId || null]);
  return find(result.rows[0].id);
}

async function update(id, data, userId) {
  const fields = [];
  const params = [id];
  for (const [key, column] of [['name', 'title'], ['description', 'description'], ['status', 'status']]) {
    if (data[key] === undefined) continue;
    params.push(key === 'description' ? (data[key]?.trim() || null) : data[key]?.trim?.() || data[key]);
    fields.push(`${column}=$${params.length}`);
  }
  if (!fields.length) return find(id);
  params.push(userId || null);
  fields.push(`updated_by=$${params.length}`, 'updated_at=CURRENT_TIMESTAMP');
  await db.query(`UPDATE question_groups SET ${fields.join(', ')} WHERE id=$1`, params);
  return find(id);
}

async function remove(id) {
  const result = await db.query('DELETE FROM question_groups WHERE id=$1 RETURNING id', [id]);
  return result.rows[0] || null;
}

module.exports = { list, find, countActiveQuestions, create, update, remove };
