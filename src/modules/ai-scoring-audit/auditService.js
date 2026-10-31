const HttpError = require('../../http/httpError');
const repository = require('./auditRepository');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const iso = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null;

class AuditService {
  constructor(auditRepository = repository) { this.repository = auditRepository; }
  async list(query = {}) {
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 25));
    for (const field of ['tenantId', 'actorId']) {
      if (query[field] && !UUID.test(query[field])) throw new HttpError(`${field} không hợp lệ.`, 400, 'INVALID_ID');
    }
    if (query.outcome && !['SUCCEEDED', 'FAILED'].includes(query.outcome)) throw new HttpError('outcome không hợp lệ.', 400, 'INVALID_AUDIT_OUTCOME');
    const from = query.from ? iso(query.from) : null; const to = query.to ? iso(query.to) : null;
    if ((query.from && !from) || (query.to && !to)) throw new HttpError('Khoảng thời gian không hợp lệ.', 400, 'INVALID_DATE_RANGE');
    return this.repository.list({ page, pageSize, tenantId: query.tenantId || null, actorId: query.actorId || null,
      resourceType: query.resourceType || null, action: query.action || null, outcome: query.outcome || null, from, to });
  }
  async detail(id) {
    if (!UUID.test(String(id || ''))) throw new HttpError('Audit event ID không hợp lệ.', 400, 'INVALID_ID');
    const event = await this.repository.detail(id);
    if (!event) throw new HttpError('Không tìm thấy audit event.', 404, 'AUDIT_EVENT_NOT_FOUND');
    return event;
  }
}

const service = new AuditService();
service.AuditService = AuditService;
module.exports = service;
