const roleRepository = require('../modules/auth/roleRepository');
const { PERMISSION_GROUPS, ALL_PERMISSIONS } = require('../modules/auth/permissions');
const HttpError = require('../http/httpError');

const cleanPermissions = value => {
  if (!Array.isArray(value)) throw new HttpError('Danh sách quyền không hợp lệ.', 400, 'VALIDATION_ERROR');
  return [...new Set(value)].filter(permission => ALL_PERMISSIONS.includes(permission));
};
const cleanSlug = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

module.exports = {
  async list(req, res) {
    const result = await roleRepository.list(req.query);
    return res.json({ success: true, data: result.rows, meta: result.meta, catalog: PERMISSION_GROUPS });
  },
  async create(req, res) {
    const slug = cleanSlug(req.body?.slug);
    const name = String(req.body?.name || '').trim();
    if (!slug || !name) throw new HttpError('Tên và mã vai trò là bắt buộc.', 400, 'VALIDATION_ERROR');
    try {
      const role = await roleRepository.create({ slug, name, description: req.body?.description, permissions: cleanPermissions(req.body?.permissions) });
      return res.status(201).json({ success: true, message: 'Đã tạo vai trò.', data: role });
    } catch (error) {
      if (error.code === '23505') throw new HttpError('Mã vai trò đã tồn tại.', 409, 'ROLE_EXISTS');
      throw error;
    }
  },
  async update(req, res) {
    const name = String(req.body?.name || '').trim();
    if (!name) throw new HttpError('Tên vai trò là bắt buộc.', 400, 'VALIDATION_ERROR');
    const role = await roleRepository.update(req.params.slug, { name, description: req.body?.description, permissions: cleanPermissions(req.body?.permissions) });
    if (!role) throw new HttpError('Không tìm thấy vai trò.', 404, 'ROLE_NOT_FOUND');
    return res.json({ success: true, message: 'Đã cập nhật quyền của vai trò.', data: role });
  },
  async remove(req, res) {
    const role = await roleRepository.findBySlug(req.params.slug);
    if (!role) throw new HttpError('Không tìm thấy vai trò.', 404, 'ROLE_NOT_FOUND');
    if (role.is_system) throw new HttpError('Không thể xóa vai trò hệ thống.', 400, 'SYSTEM_ROLE');
    const removed = await roleRepository.remove(req.params.slug);
    if (!removed) throw new HttpError('Vai trò đang được gán cho tài khoản.', 409, 'ROLE_IN_USE');
    return res.json({ success: true, message: 'Đã xóa vai trò.' });
  }
};
