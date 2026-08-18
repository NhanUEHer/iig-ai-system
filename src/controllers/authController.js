const authRepository = require('../modules/auth/authRepository');
const authService = require('../modules/auth/authService');
const HttpError = require('../http/httpError');
const roleRepository = require('../modules/auth/roleRepository');
const { hashPassword, validatePassword } = require('../modules/auth/passwordService');

async function validateRoles(input = {}) {
  const roleSlugs = [...new Set((Array.isArray(input.roleSlugs) ? input.roleSlugs : [input.role]).filter(Boolean))];
  if (!roleSlugs.length) throw new HttpError('Tài khoản phải có ít nhất một vai trò.', 400, 'ROLES_REQUIRED');
  const roles = await roleRepository.findBySlugs(roleSlugs);
  if (roles.length !== roleSlugs.length) throw new HttpError('Có vai trò không tồn tại.', 400, 'INVALID_ROLE');
  const primaryRoleSlug = input.primaryRoleSlug || input.role || roleSlugs[0];
  if (!roleSlugs.includes(primaryRoleSlug)) throw new HttpError('Vai trò chính phải thuộc danh sách vai trò đã chọn.', 400, 'INVALID_PRIMARY_ROLE');
  return { roleSlugs, primaryRoleSlug, roles };
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
    const { name, email, password, isActive = true } = req.body || {};
    const passwordError = validatePassword(password);
    if (!name?.trim() || !email?.trim() || passwordError) {
      throw new HttpError(passwordError || 'Tên, email và role hợp lệ là bắt buộc.', 400, 'VALIDATION_ERROR');
    }
    const assignment = await validateRoles(req.body);
    let user;
    try {
      user = await authRepository.createUser({ name: name.trim(), email: email.trim(), passwordHash: await hashPassword(password), isActive: Boolean(isActive), ...assignment, assignedBy: req.auth.userId });
    } catch (error) {
      if (error.code === '23505') throw new HttpError('Email đã tồn tại.', 409, 'EMAIL_EXISTS');
      throw error;
    }
    return res.status(201).json({
      success: true,
      message: 'Đã tạo tài khoản.',
      data: user
    });
  },

  async setUserPassword(req, res) {
    await authService.setUserPassword({ userId: req.params.id, password: req.body?.password });
    return res.json({ success: true, message: 'Đã đặt lại mật khẩu và thu hồi các phiên đăng nhập cũ.' });
  },

  async updateUser(req, res) {
    const { name, email, isActive = true } = req.body || {};
    if (!name?.trim() || !email?.trim()) {
      throw new HttpError('Tên, email và role hợp lệ là bắt buộc.', 400, 'VALIDATION_ERROR');
    }
    const assignment = await validateRoles(req.body);
    const keepsRoleManagement = assignment.roles.some(role => role.permissions?.includes('roles.manage')) && Boolean(isActive);
    if (!keepsRoleManagement && await authRepository.countOtherPermissionHolders(req.params.id, 'roles.manage') === 0) {
      throw new HttpError('Không thể gỡ quyền quản lý vai trò khỏi quản trị viên hoạt động cuối cùng.', 409, 'LAST_ROLE_ADMIN');
    }
    const user = await authRepository.updateUser(req.params.id, {
      name: name.trim(), email: email.trim(), ...assignment, isActive: Boolean(isActive), assignedBy: req.auth.userId
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
