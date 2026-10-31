const db = require('../../config/db');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeUuid = value => UUID.test(String(value || '')) ? String(value).toLowerCase() : null;

function map(row) {
  if (!row) return null;
  return {
    id: row.id, actorId: row.actor_id, action: row.action,
    resourceType: row.resource_type, resourceId: row.resource_id,
    tenantId: row.tenant_id, reason: row.reason, requestId: row.request_id,
    outcome: row.outcome, before: row.before_state, after: row.after_state,
    createdAt: row.created_at,
  };
}

class AuditRepository {
  constructor(database = db) { this.db = database; }

  async list({ page = 1, pageSize = 25, tenantId, actorId, resourceType, action, outcome, from, to }) {
    const params = []; const where = [];
    const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };
    if (tenantId) add('tenant_id=?', tenantId);
    if (actorId) add('actor_id=?', actorId);
    if (resourceType) add('resource_type=?', resourceType);
    if (action) add('action=?', action);
    if (outcome) add('outcome=?', outcome);
    if (from) add('created_at>=?', from);
    if (to) add('created_at<=?', to);
    params.push(pageSize, (page - 1) * pageSize);
    const result = await this.db.query(
      `SELECT *,COUNT(*) OVER()::integer AS total_count
       FROM ai_scoring_admin_audit_events
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY created_at DESC,id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { items: result.rows.map(map), page, pageSize, total: Number(result.rows[0]?.total_count || 0) };
  }

  async detail(id) {
    const result = await this.db.query(
      `SELECT * FROM ai_scoring_admin_audit_events WHERE id=$1`,
      [id]
    );
    return map(result.rows[0]);
  }

  async recordFailure({ actorId, action, resourceType, resourceId, tenantId, reason, requestId, error }) {
    await this.db.query(
      `INSERT INTO ai_scoring_admin_audit_events
         (actor_id,action,resource_type,resource_id,tenant_id,reason,request_id,outcome,after_state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'FAILED',$8::jsonb)`,
      [safeUuid(actorId), action, resourceType, safeUuid(resourceId), safeUuid(tenantId),
        reason || null, requestId || 'unknown', JSON.stringify({ errorCode: error?.code || 'INTERNAL_ERROR' })]
    );
  }
}

const repository = new AuditRepository();
repository.AuditRepository = AuditRepository;
repository.map = map;
repository.safeUuid = safeUuid;
module.exports = repository;
