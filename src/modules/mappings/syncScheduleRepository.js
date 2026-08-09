const db = require('../../config/db');

module.exports = {
  async get() {
    const result = await db.query('SELECT * FROM mapping_sync_schedule WHERE id = 1');
    return result.rows[0];
  },
  async update({ enabled, runTime, pageSize }) {
    const result = await db.query(`UPDATE mapping_sync_schedule SET
      enabled=$1, run_time=$2, page_size=$3, updated_at=CURRENT_TIMESTAMP
      WHERE id=1 RETURNING *`, [enabled, runTime, pageSize]);
    return result.rows[0];
  },
  async claim(runDate) {
    const result = await db.query(`UPDATE mapping_sync_schedule SET
      last_run_date=$1, last_run_at=CURRENT_TIMESTAMP, last_status='running',
      last_error=NULL, updated_at=CURRENT_TIMESTAMP
      WHERE id=1 AND enabled=TRUE AND last_run_date IS DISTINCT FROM $1
      RETURNING *`, [runDate]);
    return result.rows[0] || null;
  },
  async complete({ count }) {
    await db.query(`UPDATE mapping_sync_schedule SET last_status='success',
      last_count=$1, last_error=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=1`, [count]);
  },
  async fail(error) {
    await db.query(`UPDATE mapping_sync_schedule SET last_status='error',
      last_error=$1, updated_at=CURRENT_TIMESTAMP WHERE id=1`, [String(error).slice(0, 2000)]);
  }
};
