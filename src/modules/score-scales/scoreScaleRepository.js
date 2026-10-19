const crypto = require('crypto');
const db = require('../../config/db');

const mapScale = row => ({
  id: row.id, code: row.code, name: row.name, scaleType: row.scale_type,
  questionCount: Number(row.question_count), minScore: Number(row.min_score),
  maxScore: Number(row.max_score), scoreStep: Number(row.score_step),
  description: row.description || '', status: row.status, version: Number(row.version || 1),
  usageCount: Number(row.usage_count || 0), createdAt: row.created_at, updatedAt: row.updated_at,
});

const makeCode = () => `LR-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

async function list(filters = {}) {
  const values = []; const where = ["s.scale_type='LR_RAW_CORRECT'"];
  if (filters.search) { values.push(`%${String(filters.search).trim()}%`); where.push(`(s.name ILIKE $${values.length} OR s.code ILIKE $${values.length})`); }
  if (filters.scaleType) { values.push(filters.scaleType); where.push(`s.scale_type=$${values.length}`); }
  if (filters.status) { values.push(filters.status); where.push(`s.status=$${values.length}`); }
  if (filters.questionCount !== undefined && filters.questionCount !== '') {
    values.push(Number(filters.questionCount));
    where.push(`s.question_count=$${values.length}`);
  }
  const page = Math.max(Number(filters.page) || 1, 1); const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
  const base = `FROM score_scales s WHERE ${where.join(' AND ')}`;
  const total = await db.query(`SELECT COUNT(*)::int total ${base}`, values);
  const params = [...values, limit, (page - 1) * limit];
  const rows = await db.query(`SELECT s.*, (SELECT COUNT(*) FROM exam_sections es WHERE es.score_scale_id=s.id)::int usage_count ${base} ORDER BY s.updated_at DESC,s.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { items: rows.rows.map(mapScale), meta: { page, limit, total: total.rows[0].total, totalPages: Math.max(1, Math.ceil(total.rows[0].total / limit)) } };
}

async function findById(id, client = db) {
  const scale = (await client.query('SELECT s.*, (SELECT COUNT(*) FROM exam_sections es WHERE es.score_scale_id=s.id)::int usage_count FROM score_scales s WHERE s.id=$1', [id])).rows[0];
  if (!scale) return null;
  const ranges = await client.query('SELECT correct_count,converted_score FROM score_scale_raw_ranges WHERE score_scale_id=$1 ORDER BY correct_count', [id]);
  return { ...mapScale(scale), rawRanges: ranges.rows.map(row => ({ correctCount: Number(row.correct_count), convertedScore: Number(row.converted_score) })) };
}

async function create(data, userId) {
  return db.transaction(async client => {
    const scale = (await client.query(`INSERT INTO score_scales(code,name,question_count,min_score,max_score,score_step,description,status,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8,$8) RETURNING *`, [makeCode(), data.name.trim(), data.questionCount, data.minScore, data.maxScore, data.scoreStep, data.description || null, userId || null])).rows[0];
    for (const row of data.rawRanges || []) await client.query('INSERT INTO score_scale_raw_ranges(score_scale_id,correct_count,converted_score) VALUES($1,$2,$3)', [scale.id, row.correctCount, row.convertedScore]);
    return findById(scale.id, client);
  });
}

async function update(id, data, userId) {
  return db.transaction(async client => {
    const current = (await client.query('SELECT * FROM score_scales WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!current) return null;
    if (current.status !== 'DRAFT') throw new Error('SCORE_SCALE_IMMUTABLE');
    const fields = []; const values = [id]; const push = (field, value) => { values.push(value); fields.push(`${field}=$${values.length}`); };
    for (const [key, column] of [['name','name'],['questionCount','question_count'],['minScore','min_score'],['maxScore','max_score'],['scoreStep','score_step'],['description','description']]) if (data[key] !== undefined) push(column, key === 'name' ? data[key].trim() : data[key]);
    push('updated_by', userId || null); fields.push('updated_at=CURRENT_TIMESTAMP');
    await client.query(`UPDATE score_scales SET ${fields.join(',')} WHERE id=$1`, values);
    if (data.rawRanges) { await client.query('DELETE FROM score_scale_raw_ranges WHERE score_scale_id=$1', [id]); for (const row of data.rawRanges) await client.query('INSERT INTO score_scale_raw_ranges(score_scale_id,correct_count,converted_score) VALUES($1,$2,$3)', [id, row.correctCount, row.convertedScore]); }
    return findById(id, client);
  });
}

async function setStatus(id, status, userId) { const r = await db.query(`UPDATE score_scales SET status=$2,updated_by=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`, [id, status, userId || null]); return r.rows[0] ? findById(id) : null; }
async function remove(id) { const r = await db.query('DELETE FROM score_scales WHERE id=$1 AND status=\'DRAFT\' AND NOT EXISTS (SELECT 1 FROM exam_sections WHERE score_scale_id=$1) RETURNING id', [id]); return r.rows[0] || null; }
module.exports = { list, findById, create, update, setStatus, remove };
