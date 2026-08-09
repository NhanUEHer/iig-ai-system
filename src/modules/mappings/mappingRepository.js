const db = require('../../config/db');

class MappingRepository {
  constructor(database = db) {
    this.db = database;
  }

  async list() {
    const result = await this.db.query(
      `SELECT keycode, course_scoring_id, student_name, test_name, created_at, updated_at
       FROM keycode_mappings ORDER BY updated_at DESC`
    );
    return result.rows;
  }

  async listPage({ search, page = 1, limit = 10 } = {}) {
    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 10));
    const params = [];
    let where = '';
    if (search?.trim()) {
      params.push(`%${search.trim()}%`);
      where = `WHERE keycode ILIKE $1 OR course_scoring_id ILIKE $1 OR student_name ILIKE $1 OR test_name ILIKE $1`;
    }
    const count = await this.db.query(`SELECT COUNT(*)::int AS total FROM keycode_mappings ${where}`, params);
    const dataParams = [...params, safeLimit, (safePage - 1) * safeLimit];
    const result = await this.db.query(
      `SELECT keycode, course_scoring_id, student_name, test_name, created_at, updated_at
       FROM keycode_mappings ${where} ORDER BY updated_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    const total = count.rows[0]?.total || 0;
    return { rows: result.rows, meta: { page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) } };
  }

  async upsert({ keycode, courseScoringId, studentName, testName }) {
    const result = await this.db.query(
      `INSERT INTO keycode_mappings
         (keycode, course_scoring_id, student_name, test_name, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (keycode) DO UPDATE SET
         course_scoring_id = EXCLUDED.course_scoring_id,
         student_name = COALESCE(EXCLUDED.student_name, keycode_mappings.student_name),
         test_name = COALESCE(EXCLUDED.test_name, keycode_mappings.test_name),
         updated_at = CURRENT_TIMESTAMP
       RETURNING keycode, course_scoring_id, student_name, test_name`,
      [keycode, courseScoringId, studentName, testName]
    );

    if (studentName || testName) {
      await this.db.query(
        `UPDATE mocktest_submissions SET
           student_name = COALESCE($1, student_name),
           test_name = COALESCE($2, test_name),
           updated_at = CURRENT_TIMESTAMP
         WHERE keycode = $3`,
        [studentName, testName, keycode]
      );
    }
    return result.rows[0];
  }

  async delete(keycode) {
    const result = await this.db.query(
      'DELETE FROM keycode_mappings WHERE keycode = $1 RETURNING keycode',
      [keycode]
    );
    return result.rows[0] || null;
  }
}

module.exports = new MappingRepository();
module.exports.MappingRepository = MappingRepository;
