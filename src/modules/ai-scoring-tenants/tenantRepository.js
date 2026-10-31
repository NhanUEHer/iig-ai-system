const db = require('../../config/db');

function mapTenant(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    environment: row.environment,
    status: row.status,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    allowedScopes: row.allowed_scopes || [],
    rateLimit: Number(row.rate_limit_per_minute),
    metadata: row.metadata || {},
    activeCredentialCount: Number(row.active_credential_count || 0),
    webhookCount: Number(row.webhook_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicAuditState(tenant) {
  if (!tenant) return null;
  const { contactEmail, ...safe } = tenant;
  return { ...safe, contactEmail: contactEmail || null };
}

async function writeAudit(executor, { actorId, action, tenant, reason, requestId, before, after }) {
  await executor.query(
    `INSERT INTO ai_scoring_admin_audit_events
       (actor_id, action, resource_type, resource_id, tenant_id, reason, request_id, before_state, after_state)
     VALUES ($1, $2, 'TENANT', $3, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [actorId || null, action, tenant.id, reason || null, requestId, before ? JSON.stringify(publicAuditState(before)) : null, after ? JSON.stringify(publicAuditState(after)) : null]
  );
}

class TenantRepository {
  constructor(database = db) { this.db = database; }

  async list({ page, pageSize, search, status, environment }) {
    const params = [];
    const where = [];
    if (search) {
      params.push(`%${search}%`);
      where.push(`(code ILIKE $${params.length} OR name ILIKE $${params.length})`);
    }
    if (status) { params.push(status); where.push(`status = $${params.length}`); }
    if (environment) { params.push(environment); where.push(`environment = $${params.length}`); }
    params.push(pageSize, (page - 1) * pageSize);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await this.db.query(
      `SELECT t.*,
              (SELECT COUNT(*)::integer FROM integration_api_credentials c
               WHERE c.tenant_id=t.id AND c.status IN ('ACTIVE','ROTATING')
                 AND (c.expires_at IS NULL OR c.expires_at > CURRENT_TIMESTAMP)) AS active_credential_count,
              (SELECT COUNT(*)::integer FROM integration_webhook_endpoints webhook
               WHERE webhook.tenant_id=t.id AND webhook.status='ACTIVE') AS webhook_count,
              COUNT(*) OVER()::integer AS total_count
       FROM integration_tenants t
       ${clause}
       ORDER BY updated_at DESC, id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return { items: result.rows.map(mapTenant), page, pageSize, total: Number(result.rows[0]?.total_count || 0) };
  }

  async findById(id, executor = this.db) {
    const result = await executor.query(
      `SELECT t.*,
              (SELECT COUNT(*)::integer FROM integration_api_credentials c
               WHERE c.tenant_id=t.id AND c.status IN ('ACTIVE','ROTATING')
                 AND (c.expires_at IS NULL OR c.expires_at > CURRENT_TIMESTAMP)) AS active_credential_count,
              (SELECT COUNT(*)::integer FROM integration_webhook_endpoints webhook
               WHERE webhook.tenant_id=t.id AND webhook.status='ACTIVE') AS webhook_count
       FROM integration_tenants t WHERE id = $1`, [id]
    );
    return mapTenant(result.rows[0]);
  }

  async create(input, context) {
    return this.db.transaction(async executor => {
      const result = await executor.query(
        `INSERT INTO integration_tenants
           (code, name, environment, contact_name, contact_email, allowed_scopes, rate_limit_per_minute, metadata)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb) RETURNING *`,
        [input.code, input.name, input.environment, input.contactName, input.contactEmail, JSON.stringify(input.allowedScopes), input.rateLimit, JSON.stringify(input.metadata)]
      );
      const tenant = mapTenant(result.rows[0]);
      await writeAudit(executor, { ...context, action: 'TENANT_CREATED', tenant, after: tenant });
      return tenant;
    });
  }

  async update(id, input, context) {
    return this.db.transaction(async executor => {
      const before = await this.findById(id, executor);
      if (!before) return null;
      const result = await executor.query(
        `UPDATE integration_tenants SET
           name=$2, environment=$3, contact_name=$4, contact_email=$5,
           allowed_scopes=$6::jsonb, rate_limit_per_minute=$7, metadata=$8::jsonb,
           updated_at=CURRENT_TIMESTAMP
         WHERE id=$1 RETURNING *`,
        [id, input.name, input.environment, input.contactName, input.contactEmail, JSON.stringify(input.allowedScopes), input.rateLimit, JSON.stringify(input.metadata)]
      );
      const tenant = mapTenant(result.rows[0]);
      await writeAudit(executor, { ...context, action: 'TENANT_UPDATED', tenant, before, after: tenant });
      return tenant;
    });
  }

  async setStatus(id, status, context) {
    return this.db.transaction(async executor => {
      const before = await this.findById(id, executor);
      if (!before) return null;
      const result = await executor.query(
        `UPDATE integration_tenants SET status=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`,
        [id, status]
      );
      const tenant = mapTenant(result.rows[0]);
      await writeAudit(executor, { ...context, action: status === 'ACTIVE' ? 'TENANT_ACTIVATED' : 'TENANT_SUSPENDED', tenant, before, after: tenant });
      return tenant;
    });
  }

  async auditEvents(tenantId, { page = 1, pageSize = 25 } = {}) {
    const result = await this.db.query(
      `SELECT id, actor_id, action, reason, request_id, outcome, before_state, after_state, created_at,
              COUNT(*) OVER()::integer AS total_count
       FROM ai_scoring_admin_audit_events
       WHERE tenant_id=$1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
      [tenantId, pageSize, (page - 1) * pageSize]
    );
    return { items: result.rows.map(row => ({ id: row.id, actorId: row.actor_id, action: row.action, reason: row.reason, requestId: row.request_id, outcome: row.outcome, before: row.before_state, after: row.after_state, createdAt: row.created_at })), page, pageSize, total: Number(result.rows[0]?.total_count || 0) };
  }
}

const repository = new TenantRepository();
repository.TenantRepository = TenantRepository;
repository.mapTenant = mapTenant;
module.exports = repository;
