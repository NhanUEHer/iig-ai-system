const service = require('../modules/ai-scoring-tenants/tenantService');
const { audited } = require('../modules/ai-scoring-audit/auditFailure');

const context = req => ({ actorId: req.auth?.userId, requestId: req.requestId });
const tenantId = req => req.params.tenantId;

module.exports = {
  async list(req, res) { res.json({ success: true, data: await service.list(req.query) }); },
  create: audited('TENANT_CREATED', 'TENANT', {}, async (req, res) => { res.status(201).json({ success: true, data: await service.create(req.body, context(req)) }); }),
  async detail(req, res) { res.json({ success: true, data: await service.detail(req.params.tenantId) }); },
  update: audited('TENANT_UPDATED', 'TENANT', { resourceId: tenantId, tenantId }, async (req, res) => { res.json({ success: true, data: await service.update(req.params.tenantId, req.body, context(req)) }); }),
  activate: audited('TENANT_ACTIVATED', 'TENANT', { resourceId: tenantId, tenantId }, async (req, res) => { res.json({ success: true, data: await service.setStatus(req.params.tenantId, 'ACTIVE', req.body, context(req)) }); }),
  suspend: audited('TENANT_SUSPENDED', 'TENANT', { resourceId: tenantId, tenantId }, async (req, res) => { res.json({ success: true, data: await service.setStatus(req.params.tenantId, 'SUSPENDED', req.body, context(req)) }); }),
  async audit(req, res) { res.json({ success: true, data: await service.auditEvents(req.params.tenantId, req.query) }); },
};
