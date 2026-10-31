const HttpError = require('../../http/httpError');
const repository = require('./tenantRepository');
const validator = require('./tenantValidator');

class TenantService {
  constructor(tenantRepository = repository) { this.repository = tenantRepository; }

  list(query) { return this.repository.list(validator.listInput(query)); }

  async detail(id) {
    const tenant = await this.repository.findById(id);
    if (!tenant) throw new HttpError('Không tìm thấy tenant.', 404, 'TENANT_NOT_FOUND');
    return tenant;
  }

  async create(body, context) {
    try { return await this.repository.create(validator.createInput(body), context); }
    catch (error) {
      if (error?.code === '23505') throw new HttpError('Code tenant đã tồn tại.', 409, 'TENANT_CODE_EXISTS');
      throw error;
    }
  }

  async update(id, body, context) {
    const tenant = await this.repository.update(id, validator.updateInput(body), context);
    if (!tenant) throw new HttpError('Không tìm thấy tenant.', 404, 'TENANT_NOT_FOUND');
    return tenant;
  }

  async setStatus(id, status, body, context) {
    const reason = validator.statusReason(body);
    const tenant = await this.repository.setStatus(id, status, { ...context, reason });
    if (!tenant) throw new HttpError('Không tìm thấy tenant.', 404, 'TENANT_NOT_FOUND');
    return tenant;
  }

  async auditEvents(id, query) {
    await this.detail(id);
    const { page, pageSize } = validator.listInput(query);
    return this.repository.auditEvents(id, { page, pageSize });
  }
}

const service = new TenantService();
service.TenantService = TenantService;
module.exports = service;
