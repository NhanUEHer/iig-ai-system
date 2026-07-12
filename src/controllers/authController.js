const db = require('../config/db');

const authController = {
  /**
   * Log in user
   */
  async login(req, res) {
    const { username, password } = req.body || {};
    console.log(`🔐 Incoming login request: username="${username}", password="${password}"`);
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Tên đăng nhập và mật khẩu là bắt buộc.' });
    }
    try {
      const userRes = await db.query(
        'SELECT id, username, password, role FROM users WHERE LOWER(username) = LOWER($1)',
        [username.trim()]
      );
      if (userRes.rows.length === 0) {
        return res.status(401).json({ success: false, error: 'Tài khoản hoặc mật khẩu không chính xác.' });
      }
      const user = userRes.rows[0];
      if (user.password !== password) {
        return res.status(401).json({ success: false, error: 'Tài khoản hoặc mật khẩu không chính xác.' });
      }

      return res.json({
        data: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Login Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * List all users (Admin only)
   */
  async listUsers(req, res) {
    try {
      const usersRes = await db.query('SELECT id, username, role, created_at FROM users ORDER BY id ASC');
      return res.json({ success: true, data: usersRes.rows });
    } catch (error) {
      console.error('List Users Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Create a new user (Admin only)
   */
  async createUser(req, res) {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ success: false, error: 'Username, password and role are required.' });
    }

    try {
      // Check existing username
      const existing = await db.query('SELECT id FROM users WHERE username = $1', [username]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ success: false, error: 'Username already exists.' });
      }

      const createRes = await db.query(
        'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at',
        [username, password, role]
      );

      return res.json({
        success: true,
        message: `Successfully created user '${username}'`,
        data: createRes.rows[0]
      });
    } catch (error) {
      console.error('Create User Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Update a user's role (Admin only)
   */
  /**
   * Update a user's details (Admin only)
   */
  async updateUser(req, res) {
    const { id } = req.params;
    const { role, password } = req.body;

    if (!role) {
      return res.status(400).json({ success: false, error: 'Role is required.' });
    }

    try {
      let updateRes;
      if (password && password.trim() !== '') {
        updateRes = await db.query(
          'UPDATE users SET role = $1, password = $2 WHERE id = $3 RETURNING id, username, role',
          [role, password.trim(), id]
        );
      } else {
        updateRes = await db.query(
          'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, role',
          [role, id]
        );
      }

      if (updateRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found.' });
      }

      return res.json({
        success: true,
        message: 'Cập nhật thông tin người dùng thành công.',
        data: updateRes.rows[0]
      });
    } catch (error) {
      console.error('Update User Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Delete a user (Admin only)
   */
  async deleteUser(req, res) {
    const { id } = req.params;

    try {
      const deleteRes = await db.query('DELETE FROM users WHERE id = $1 RETURNING id, username', [id]);
      if (deleteRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'User not found.' });
      }

      return res.json({
        success: true,
        message: `Successfully deleted user '${deleteRes.rows[0].username}'`
      });
    } catch (error) {
      console.error('Delete User Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
};

module.exports = authController;
