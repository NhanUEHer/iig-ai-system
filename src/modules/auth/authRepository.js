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
    const [result, count] = await Promise.all([this.db.query(
      `SELECT id, name, email, username, role, is_active, force_password_change,
              created_at, last_login_at
       FROM users WHERE name ILIKE $1 OR email ILIKE $1 OR role ILIKE $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [query, safeLimit, (safePage - 1) * safeLimit]
    ), this.db.query('SELECT COUNT(*)::int AS total FROM users WHERE name ILIKE $1 OR email ILIKE $1 OR role ILIKE $1', [query])]);
    const total = count.rows[0]?.total || 0;
    return { rows: result.rows, meta: { page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) } };
  }

  async createUser({ name, email, role }) {
    const result = await this.db.query(
      `INSERT INTO users (name, email, username, password, role, force_password_change)
       VALUES ($1, LOWER($2), LOWER($2), '', $3, TRUE)
       RETURNING id, name, email, username, role, is_active, force_password_change, created_at`,
      [name, email, role]
    );
    return result.rows[0];
  }

  async updateUser(id, { name, email, role, isActive }) {
    const result = await this.db.query(
      `UPDATE users SET name = $1, email = LOWER($2), username = LOWER($2), role = $3,
              is_active = $4, updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, name, email, username, role, is_active, force_password_change, created_at`,
      [name, email, role, isActive, id]
    );
    return result.rows[0] || null;
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

  async createPasswordToken({ userId, tokenHash, purpose, expiresAt }) {
    await this.db.query(
      `UPDATE password_action_tokens SET used_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
      [userId, purpose]
    );
    await this.db.query(
      `INSERT INTO password_action_tokens (user_id, token_hash, purpose, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, tokenHash, purpose, expiresAt]
    );
  }

  async consumePasswordToken(tokenHash) {
    const result = await this.db.query(
      `UPDATE password_action_tokens SET used_at = CURRENT_TIMESTAMP
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       RETURNING user_id, purpose`,
      [tokenHash]
    );
    return result.rows[0] || null;
  }
}

module.exports = new AuthRepository();
module.exports.AuthRepository = AuthRepository;
