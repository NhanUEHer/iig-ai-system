const service = require('../modules/ai-scoring-credentials/credentialService');
const { audited } = require('../modules/ai-scoring-audit/auditFailure');

const context = req => ({ actorId: req.auth?.userId, requestId: req.requestId });
const noStore = res => res.setHeader('cache-control', 'no-store');
const tenantId = req => req.params.tenantId;
const credentialId = req => req.params.credentialId;

module.exports = {
  async list(req, res) { res.json({ success: true, data: await service.list(req.params.tenantId) }); },
  create: audited('CREDENTIAL_CREATED', 'CREDENTIAL', { tenantId }, async (req, res) => { noStore(res); res.status(201).json({ success: true, data: await service.create(req.params.tenantId, req.body, context(req)) }); }),
  update: audited('CREDENTIAL_UPDATED', 'CREDENTIAL', { resourceId: credentialId }, async (req, res) => { res.json({ success: true, data: await service.update(req.params.credentialId, req.body, context(req)) }); }),
  rotate: audited('CREDENTIAL_ROTATED', 'CREDENTIAL', { resourceId: credentialId }, async (req, res) => { noStore(res); res.json({ success: true, data: await service.rotate(req.params.credentialId, req.body, context(req)) }); }),
  revoke: audited('CREDENTIAL_REVOKED', 'CREDENTIAL', { resourceId: credentialId }, async (req, res) => { res.json({ success: true, data: await service.revoke(req.params.credentialId, req.body, context(req)) }); }),
};
