const db = require('../../config/db');

class AuthRepository {
  constructor(database = db) {
    this.db = database;
  }

  async findUserByEmail(email) {
    const result = await this.db.query(
      `SELECT id, name, email, username, password, password_hash, role, is_active,
              force_password_change, created_at, last_login_at
       FROM users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );
    return result.rows[0] || null;
  }

  async getUserAccess(userId) {
    const result = await this.db.query(`SELECT r.id,r.slug,r.name,r.permissions,ur.is_primary
      FROM user_roles ur JOIN roles r ON r.id=ur.role_id
      WHERE ur.user_id=$1 ORDER BY ur.is_primary DESC,r.name`, [userId]);
    const roles = result.rows.map(role => ({ ...role, permissions: Array.isArray(role.permissions) ? role.permissions : [] }));
    return { roles, permissions: [...new Set(roles.flatMap(role => role.permissions))] };
  }

  async findUserById(id) {
    const result = await this.db.query(
      `SELECT id, name, email, username, role, is_active, force_password_change,
              created_at, last_login_at
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findCredentialsById(id) {
    const result = await this.db.query(
      'SELECT id, password_hash, password, is_active FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async listUsers({ page = 1, limit = 10, search = '' } = {}) {
    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 10));
    const query = `%${String(search).trim()}%`;
    const filter = `u.name ILIKE $1 OR u.email ILIKE $1 OR EXISTS (
      SELECT 1 FROM user_roles sx JOIN roles sr ON sr.id=sx.role_id
      WHERE sx.user_id=u.id AND (sr.slug ILIKE $1 OR sr.name ILIKE $1))`;
    const [result, count] = await Promise.all([this.db.query(
      `SELECT u.id,u.name,u.email,u.username,u.role,u.is_active,u.force_password_change,
              u.created_at,u.last_login_at,
              COALESCE(jsonb_agg(jsonb_build_object('id',r.id,'slug',r.slug,'name',r.name,'isPrimary',ur.is_primary)
                ORDER BY ur.is_primary DESC,r.name) FILTER (WHERE r.id IS NOT NULL),'[]'::jsonb) roles
       FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id
       WHERE ${filter} GROUP BY u.id
       ORDER BY u.created_at DESC LIMIT $2 OFFSET $3`, [query, safeLimit, (safePage - 1) * safeLimit]
    ), this.db.query(`SELECT COUNT(*)::int AS total FROM users u WHERE ${filter}`, [query])]);
    const total = count.rows[0]?.total || 0;
    return { rows: result.rows, meta: { page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) } };
  }

  async createUser({ name, email, passwordHash, roleSlugs, primaryRoleSlug, isActive = true, assignedBy }) {
    return this.db.transaction(async client => {
      const result = await client.query(
        `INSERT INTO users (name,email,username,password,password_hash,role,is_active,force_password_change,password_changed_at)
         VALUES ($1,LOWER($2),LOWER($2),'',$3,$4,$5,FALSE,CURRENT_TIMESTAMP)
         RETURNING id,name,email,username,role,is_active,force_password_change,created_at`,
        [name, email, passwordHash, primaryRoleSlug, isActive]
      );
      await this.replaceUserRoles(client, result.rows[0].id, roleSlugs, primaryRoleSlug, assignedBy);
      return result.rows[0];
    });
  }

  async replaceUserRoles(client, userId, roleSlugs, primaryRoleSlug, assignedBy) {
    const before = await client.query(`SELECT r.slug FROM user_roles ur JOIN roles r ON r.id=ur.role_id
      WHERE ur.user_id=$1 ORDER BY r.slug`, [userId]);
    await client.query('DELETE FROM user_roles WHERE user_id=$1', [userId]);
    await client.query(`INSERT INTO user_roles(user_id,role_id,is_primary,assigned_by)
      SELECT $1,r.id,(r.slug=$3),$4 FROM roles r WHERE r.slug=ANY($2::text[])`,
    [userId, roleSlugs, primaryRoleSlug, assignedBy || null]);
    await client.query(`INSERT INTO user_role_audit_logs(user_id,actor_id,previous_roles,current_roles)
      VALUES($1,$2,$3::jsonb,$4::jsonb)`, [userId, assignedBy || null,
      JSON.stringify(before.rows.map(row => row.slug)), JSON.stringify(roleSlugs)]);
  }

  async updateUser(id, { name, email, roleSlugs, primaryRoleSlug, isActive, assignedBy }) {
    return this.db.transaction(async client => {
      const result = await client.query(
        `UPDATE users SET name=$1,email=LOWER($2),username=LOWER($2),role=$3,
                is_active=$4,updated_at=CURRENT_TIMESTAMP WHERE id=$5
         RETURNING id,name,email,username,role,is_active,force_password_change,created_at`,
        [name, email, primaryRoleSlug, isActive, id]
      );
      if (!result.rows[0]) return null;
      await this.replaceUserRoles(client, id, roleSlugs, primaryRoleSlug, assignedBy);
      return result.rows[0];
    });
  }

  async countOtherPermissionHolders(userId, permission) {
    const result = await this.db.query(`SELECT COUNT(DISTINCT u.id)::int count FROM users u
      JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
      WHERE u.is_active=TRUE AND u.id<>$1 AND r.permissions ? $2`, [userId, permission]);
    return result.rows[0]?.count || 0;
  }

  async deleteUser(id) {
    const result = await this.db.query('DELETE FROM users WHERE id = $1 RETURNING id, name, email', [id]);
    return result.rows[0] || null;
  }

  async setPassword(userId, passwordHash) {
    await this.db.query(
      `UPDATE users SET password_hash = $1, password = '', force_password_change = FALSE,
              password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [passwordHash, userId]
    );
  }

  async touchLogin(userId) {
    await this.db.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
  }

  async createSession({ userId, idleExpiresAt, absoluteExpiresAt, userAgent, ipAddress }) {
    const result = await this.db.query(
      `INSERT INTO auth_sessions (user_id, idle_expires_at, absolute_expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, idle_expires_at, absolute_expires_at`,
      [userId, idleExpiresAt, absoluteExpiresAt, userAgent, ipAddress]
    );
    return result.rows[0];
  }

  async findActiveSession(sessionId) {
    const result = await this.db.query(
      `SELECT s.*, u.name, u.email, u.role, u.is_active, u.force_password_change
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 AND s.revoked_at IS NULL`,
      [sessionId]
    );
    return result.rows[0] || null;
  }

  async extendSession(sessionId, idleExpiresAt) {
    await this.db.query(
      `UPDATE auth_sessions SET idle_expires_at = $1, last_activity_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [idleExpiresAt, sessionId]
    );
  }

  async revokeSession(sessionId) {
    await this.db.query(
      'UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1 AND revoked_at IS NULL',
      [sessionId]
    );
  }

  async revokeUserSessions(userId) {
    await this.db.query(
      'UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL',
      [userId]
    );
  }

}

module.exports = new AuthRepository();
module.exports.AuthRepository = AuthRepository;
