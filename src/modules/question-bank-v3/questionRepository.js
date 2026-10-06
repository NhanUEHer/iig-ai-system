const db = require('../../config/db');

const QUESTION_TYPES = [
  { value: 'MCQ_SINGLE', label: 'Dạng 1: MCQ' },
  { value: 'RECORD', label: 'Dạng 2: Record' },
  { value: 'WRITING', label: 'Dạng 3: Writing' },
];

const map = row => row && ({
  id: row.id,
  code: row.code,
  questionName: row.question_name,
  groupId: row.group_id,
  groupName: row.group_title || null,
  questionType: row.question_type,
  note: row.note,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

function listValues(value) {
  if (Array.isArray(value)) return value.flatMap(listValues);
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

// Filters follow the plural-only contract from the spec: groupIds,
// questionTypes and statuses. Singular aliases and tag filters are not accepted.
function buildWhere({ search, groupIds, questionTypes, statuses } = {}) {
  const where = [];
  const params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
  if (search) { params.push(`%${search}%`); where.push(`(q.question_name ILIKE $${params.length} OR q.code ILIKE $${params.length} OR q.note ILIKE $${params.length})`); }
  const groups = [...new Set(listValues(groupIds))];
  if (groups.length) add('q.group_id = ANY(?::uuid[])', groups);
  const types = [...new Set(listValues(questionTypes))].filter(type => QUESTION_TYPES.some(item => item.value === type));
  if (types.length) add('q.question_type = ANY(?::text[])', types);
  const selectedStatuses = [...new Set(listValues(statuses))];
  if (selectedStatuses.length) add('q.status = ANY(?::text[])', selectedStatuses);
  return { where, params };
}

async function list(query = {}) {
  const { page = 1, limit = 10, sortBy = 'created_at', sortDirection = 'desc' } = query;
  const allowed = { created_at: 'q.created_at', updated_at: 'q.updated_at', question_name: 'q.question_name', status: 'q.status', code: 'q.code' };
  const order = allowed[sortBy] || allowed.created_at;
  const direction = String(sortDirection).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const { where, params } = buildWhere(query);
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await db.query(`SELECT COUNT(*)::int total FROM question_bank_questions q ${filter}`, params);
  const total = count.rows[0].total;
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const rowParams = [...params, safeLimit, (safePage - 1) * safeLimit];
  const rows = await db.query(`SELECT q.*, g.title group_title,
    (SELECT COUNT(*) FROM question_bank_contents c WHERE c.question_id=q.id)::int content_count,
    (SELECT COUNT(*) FROM question_bank_sub_questions s WHERE s.question_id=q.id)::int sub_question_count
    FROM question_bank_questions q JOIN question_groups g ON g.id=q.group_id ${filter}
    ORDER BY ${order} ${direction} LIMIT $${rowParams.length - 1} OFFSET $${rowParams.length}`, rowParams);
  return {
    data: rows.rows.map(row => ({ ...map(row), contentCount: row.content_count, subQuestionCount: row.sub_question_count })),
    meta: { page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)), sortBy, sortDirection: direction.toLowerCase() },
  };
}

async function filterOptions(query = {}) {
  const { where, params } = buildWhere({ ...query, questionTypes: [] });
  const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await db.query(`SELECT q.question_type AS value, COUNT(*)::int AS count FROM question_bank_questions q ${filter} GROUP BY q.question_type`, params);
  const counts = new Map(result.rows.map(row => [row.value, row.count]));
  return { questionTypes: QUESTION_TYPES.map(type => ({ ...type, count: counts.get(type.value) || 0 })) };
}

async function findById(id) {
  const result = await db.query('SELECT q.*,g.title group_title FROM question_bank_questions q JOIN question_groups g ON g.id=q.group_id WHERE q.id=$1', [id]);
  return map(result.rows[0]);
}

// The business code is generated from a dedicated sequence inside the same
// transaction as the insert. Clients never supply or edit the code.
async function nextCode(client) {
  const r = await client.query("SELECT 'QB-' || LPAD(nextval('question_code_seq')::text, 6, '0') AS code");
  return r.rows[0].code;
}

async function create(data, userId) {
  return db.transaction(async client => {
    const code = await nextCode(client);
    const result = await client.query(
      `INSERT INTO question_bank_questions(code,question_name,group_id,question_type,note,status,created_by,updated_by)
       VALUES($1,$2,$3,$4,$5,'DRAFT',$6,$6) RETURNING *`,
      [code, data.questionName.trim(), data.groupId, data.questionType, data.note || null, userId || null],
    );
    const detail = await client.query('SELECT q.*,g.title group_title FROM question_bank_questions q JOIN question_groups g ON g.id=q.group_id WHERE q.id=$1', [result.rows[0].id]);
    return map(detail.rows[0]);
  });
}

// question_type and code are immutable and never updated here.
async function update(id, data, userId) {
  const fields = [];
  const values = [id];
  for (const [key, column] of [['questionName', 'question_name'], ['groupId', 'group_id'], ['note', 'note'], ['status', 'status']]) {
    if (data[key] !== undefined) { values.push(data[key]); fields.push(`${column}=$${values.length}`); }
  }
  if (!fields.length) return findById(id);
  values.push(userId || null);
  fields.push(`updated_by=$${values.length}`);
  await db.query(`UPDATE question_bank_questions SET ${fields.join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=$1`, values);
  return findById(id);
}

async function remove(id) {
  const result = await db.query('DELETE FROM question_bank_questions WHERE id=$1 RETURNING id', [id]);
  return result.rows[0] || null;
}

module.exports = { map, list, filterOptions, findById, create, update, remove };
