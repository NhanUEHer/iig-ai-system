const db = require('../../config/db');

const normalize = row => row ? { ...row, permissions: Array.isArray(row.permissions) ? row.permissions : [] } : null;

module.exports = {
  async list({ page = 1, limit = 10, search = '' } = {}) {
    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 10));
    const query = `%${String(search).trim()}%`;
    const [result, count] = await Promise.all([
      db.query(`SELECT r.*, COUNT(ur.user_id)::int AS user_count FROM roles r
        LEFT JOIN user_roles ur ON ur.role_id = r.id
        WHERE r.name ILIKE $1 OR r.slug ILIKE $1 OR COALESCE(r.description,'') ILIKE $1
        GROUP BY r.id ORDER BY r.is_system DESC, r.name LIMIT $2 OFFSET $3`, [query, safeLimit, (safePage - 1) * safeLimit]),
      db.query(`SELECT COUNT(*)::int AS total FROM roles r
        WHERE r.name ILIKE $1 OR r.slug ILIKE $1 OR COALESCE(r.description,'') ILIKE $1`, [query])
    ]);
    const total = count.rows[0]?.total || 0;
    return { rows: result.rows.map(normalize), meta: { page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) } };
  },
  async findBySlug(slug) {
    const result = await db.query('SELECT * FROM roles WHERE slug = $1', [slug]);
    return normalize(result.rows[0]);
  },
  async findBySlugs(slugs) {
    if (!Array.isArray(slugs) || !slugs.length) return [];
    const result = await db.query('SELECT * FROM roles WHERE slug = ANY($1::text[]) ORDER BY name', [slugs]);
    return result.rows.map(normalize);
  },
  async findForUser(userId) {
    const result = await db.query(`SELECT r.*, ur.is_primary
      FROM user_roles ur JOIN roles r ON r.id=ur.role_id
      WHERE ur.user_id=$1 ORDER BY ur.is_primary DESC, r.name`, [userId]);
    return result.rows.map(normalize);
  },
  async create({ slug, name, description, permissions }) {
    const result = await db.query(`INSERT INTO roles (slug,name,description,permissions)
      VALUES ($1,$2,$3,$4::jsonb) RETURNING *`, [slug, name, description || null, JSON.stringify(permissions)]);
    return normalize(result.rows[0]);
  },
  async update(slug, { name, description, permissions }) {
    const result = await db.query(`UPDATE roles SET name=$1,description=$2,permissions=$3::jsonb,updated_at=CURRENT_TIMESTAMP
      WHERE slug=$4 RETURNING *`, [name, description || null, JSON.stringify(permissions), slug]);
    return normalize(result.rows[0]);
  },
  async remove(slug) {
    const result = await db.query(`DELETE FROM roles r WHERE slug=$1 AND is_system=FALSE
      AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.role_id=r.id) RETURNING slug`, [slug]);
    return result.rows[0] || null;
  }
};
