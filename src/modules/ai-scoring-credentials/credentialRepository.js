const db = require('../../config/db');

function mapCredential(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    tokenPrefix: row.token_prefix,
    scopes: row.scopes || [],
    status: row.status,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    supersededById: row.superseded_by_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function writeAudit(executor, { actorId, action, tenantId, credential, reason, requestId, before, after }) {
  const safe = value => value ? { ...value, tokenHash: undefined } : null;
  await executor.query(
    `INSERT INTO ai_scoring_admin_audit_events
       (actor_id, action, resource_type, resource_id, tenant_id, reason, request_id, before_state, after_state)
     VALUES ($1,$2,'CREDENTIAL',$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
    [actorId || null, action, credential.id, tenantId, reason || null, requestId,
      before ? JSON.stringify(safe(before)) : null, after ? JSON.stringify(safe(after)) : null]
  );
}

class CredentialRepository {
  constructor(database = db) { this.db = database; }

  async tenantById(tenantId, executor = this.db) {
    const result = await executor.query('SELECT * FROM integration_tenants WHERE id=$1', [tenantId]);
    return result.rows[0] || null;
  }

  async list(tenantId) {
    const result = await this.db.query(
      `SELECT id, tenant_id, name, token_prefix, scopes, status, expires_at, last_used_at,
              revoked_at, superseded_by_id, created_at, updated_at
       FROM integration_api_credentials WHERE tenant_id=$1 ORDER BY created_at DESC, id DESC`,
      [tenantId]
    );
    return result.rows.map(mapCredential);
  }

  async findById(id, executor = this.db) {
    const result = await executor.query('SELECT * FROM integration_api_credentials WHERE id=$1', [id]);
    return mapCredential(result.rows[0]);
  }

  async create(tenantId, input, material, context) {
    return this.db.transaction(async executor => {
      const tenant = await this.tenantById(tenantId, executor);
      if (!tenant) return null;
      const result = await executor.query(
        `INSERT INTO integration_api_credentials
           (tenant_id,name,token_prefix,token_hash,scopes,expires_at,created_by)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING *`,
        [tenantId, input.name, material.prefix, material.hash, JSON.stringify(input.scopes), input.expiresAt, context.actorId || null]
      );
      const credential = mapCredential(result.rows[0]);
      await writeAudit(executor, { ...context, action: 'CREDENTIAL_CREATED', tenantId, credential, after: credential });
      return { credential, tenant };
    });
  }

  async update(id, input, context) {
    return this.db.transaction(async executor => {
      const before = await this.findById(id, executor);
      if (!before) return null;
      const result = await executor.query(
        `UPDATE integration_api_credentials SET name=$2, scopes=$3::jsonb, expires_at=$4,
           updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status <> 'REVOKED' RETURNING *`,
        [id, input.name, JSON.stringify(input.scopes), input.expiresAt]
      );
      if (!result.rows[0]) return { blocked: true, credential: before };
      const credential = mapCredential(result.rows[0]);
      await writeAudit(executor, { ...context, action: 'CREDENTIAL_UPDATED', tenantId: credential.tenantId, credential, before, after: credential });
      return { credential };
    });
  }

  async revoke(id, reason, context) {
    return this.db.transaction(async executor => {
      const before = await this.findById(id, executor);
      if (!before) return null;
      const result = await executor.query(
        `UPDATE integration_api_credentials SET status='REVOKED', revoked_at=CURRENT_TIMESTAMP,
           updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND status <> 'REVOKED' RETURNING *`, [id]
      );
      const credential = result.rows[0] ? mapCredential(result.rows[0]) : before;
      if (result.rows[0]) await writeAudit(executor, { ...context, action: 'CREDENTIAL_REVOKED', tenantId: credential.tenantId, credential, reason, before, after: credential });
      return { credential, alreadyRevoked: !result.rows[0] };
    });
  }

  async rotate(id, material, { reason, overlapMinutes }, context) {
    return this.db.transaction(async executor => {
      const before = await this.findById(id, executor);
      if (!before) return null;
      if (before.status === 'REVOKED') return { blocked: true, credential: before };
      const tenant = await this.tenantById(before.tenantId, executor);
      const expiresAt = before.expiresAt;
      const result = await executor.query(
        `INSERT INTO integration_api_credentials
           (tenant_id,name,token_prefix,token_hash,scopes,expires_at,created_by)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING *`,
        [before.tenantId, before.name, material.prefix, material.hash, JSON.stringify(before.scopes), expiresAt, context.actorId || null]
      );
      const credential = mapCredential(result.rows[0]);
      await executor.query(
        `UPDATE integration_api_credentials SET status=$2,
           expires_at=CASE WHEN $3::integer = 0 THEN CURRENT_TIMESTAMP
             ELSE LEAST(COALESCE(expires_at, CURRENT_TIMESTAMP + ($3::text || ' minutes')::interval), CURRENT_TIMESTAMP + ($3::text || ' minutes')::interval) END,
           revoked_at=CASE WHEN $3::integer = 0 THEN CURRENT_TIMESTAMP ELSE revoked_at END,
           superseded_by_id=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [id, overlapMinutes > 0 ? 'ROTATING' : 'REVOKED', overlapMinutes, credential.id]
      );
      await writeAudit(executor, { ...context, action: 'CREDENTIAL_ROTATED', tenantId: before.tenantId, credential, reason, before, after: credential });
      return { credential, tenant };
    });
  }

  async findActiveByHash(hash) {
    const result = await this.db.query(
      `SELECT c.*, t.code AS tenant_code, t.status AS tenant_status,
              t.rate_limit_per_minute, t.environment
       FROM integration_api_credentials c JOIN integration_tenants t ON t.id=c.tenant_id
       WHERE c.token_hash=$1 AND c.status IN ('ACTIVE','ROTATING')
         AND (c.expires_at IS NULL OR c.expires_at > CURRENT_TIMESTAMP)`, [hash]
    );
    return result.rows[0] || null;
  }

  async touchLastUsed(id) {
    await this.db.query(
      `UPDATE integration_api_credentials SET last_used_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND (last_used_at IS NULL OR last_used_at < CURRENT_TIMESTAMP - INTERVAL '15 minutes')`, [id]
    );
  }
}

const repository = new CredentialRepository();
repository.CredentialRepository = CredentialRepository;
repository.mapCredential = mapCredential;
module.exports = repository;
