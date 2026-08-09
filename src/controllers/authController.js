const authRepository = require('../modules/auth/authRepository');
const authService = require('../modules/auth/authService');
const HttpError = require('../http/httpError');
const roleRepository = require('../modules/auth/roleRepository');

async function validateRole(role) {
  if (!role || !await roleRepository.findBySlug(role)) throw new HttpError('Vai trò không hợp lệ.', 400, 'VALIDATION_ERROR');
}

module.exports = {
  async login(req, res) {
    const result = await authService.login({
      email: req.body?.email,
      password: req.body?.password,
      userAgent: req.get('user-agent'),
      ipAddress: req.ip
    });
    return res.json({ success: true, ...result });
  },

  async logout(req, res) {
    await authRepository.revokeSession(req.auth.sessionId);
    return res.json({ success: true, message: 'Đã đăng xuất.' });
  },

  async me(req, res) {
    return res.json({ success: true, user: req.user });
  },

  async forgotPassword(req, res) {
    const result = await authService.requestPasswordReset(req.body?.email);
    return res.json({ success: true, ...result });
  },

  async resetPassword(req, res) {
    await authService.resetPassword(req.body || {});
    return res.json({ success: true, message: 'Mật khẩu đã được thiết lập. Bạn có thể đăng nhập.' });
  },

  async changePassword(req, res) {
    await authService.changePassword({
      userId: req.auth.userId,
      currentPassword: req.body?.currentPassword,
      newPassword: req.body?.newPassword
    });
    return res.json({ success: true, message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' });
  },

  async listUsers(req, res) {
    const result = await authRepository.listUsers(req.query);
    return res.json({ success: true, users: result.rows, meta: result.meta });
  },

  async createUser(req, res) {
    const { name, email, role } = req.body || {};
    if (!name?.trim() || !email?.trim()) {
      throw new HttpError('Tên, email và role hợp lệ là bắt buộc.', 400, 'VALIDATION_ERROR');
    }
    await validateRole(role);
    let user;
    try {
      user = await authRepository.createUser({ name: name.trim(), email: email.trim(), role });
    } catch (error) {
      if (error.code === '23505') throw new HttpError('Email đã tồn tại.', 409, 'EMAIL_EXISTS');
      throw error;
    }
    await authService.issuePasswordAction(user, 'setup');
    return res.status(201).json({
      success: true,
      message: 'Đã tạo tài khoản và gửi email thiết lập mật khẩu.',
      data: user
    });
  },

  async resendInvite(req, res) {
    const user = await authRepository.findUserById(req.params.id);
    if (!user) throw new HttpError('Không tìm thấy tài khoản.', 404, 'USER_NOT_FOUND');
    if (!user.force_password_change) throw new HttpError('Tài khoản đã hoàn tất kích hoạt.', 400, 'ACCOUNT_ALREADY_ACTIVE');
    await authService.issuePasswordAction(user, 'setup');
    return res.json({ success: true, message: 'Đã gửi lại email thiết lập mật khẩu.' });
  },

  async updateUser(req, res) {
    const { name, email, role, isActive = true } = req.body || {};
    if (!name?.trim() || !email?.trim()) {
      throw new HttpError('Tên, email và role hợp lệ là bắt buộc.', 400, 'VALIDATION_ERROR');
    }
    await validateRole(role);
    const user = await authRepository.updateUser(req.params.id, {
      name: name.trim(), email: email.trim(), role, isActive: Boolean(isActive)
    });
    if (!user) throw new HttpError('Không tìm thấy tài khoản.', 404, 'USER_NOT_FOUND');
    if (!user.is_active) await authRepository.revokeUserSessions(user.id);
    return res.json({ success: true, message: 'Đã cập nhật tài khoản.', data: user });
  },

  async deleteUser(req, res) {
    if (req.auth.userId === req.params.id) {
      throw new HttpError('Không thể xóa tài khoản đang đăng nhập.', 400, 'SELF_DELETE');
    }
    const user = await authRepository.deleteUser(req.params.id);
    if (!user) throw new HttpError('Không tìm thấy tài khoản.', 404, 'USER_NOT_FOUND');
    return res.json({ success: true, message: `Đã xóa tài khoản ${user.email}.` });
  }
};
