const service = require('../modules/ai-scoring-webhooks/webhookService');
const { audited } = require('../modules/ai-scoring-audit/auditFailure');

const context = req => ({ actorId: req.auth?.userId, requestId: req.requestId });
const noStore = res => res.setHeader('cache-control', 'no-store');
const tenantId = req => req.params.tenantId;
const webhookId = req => req.params.webhookId;
const deliveryId = req => req.params.deliveryId;

module.exports = {
  async listEndpoints(req, res) { res.json({ success: true, data: await service.listEndpoints(req.params.tenantId) }); },
  createEndpoint: audited('WEBHOOK_CREATED', 'WEBHOOK', { tenantId }, async (req, res) => { noStore(res); res.status(201).json({ success: true, data: await service.createEndpoint(req.params.tenantId, req.body, context(req)) }); }),
  updateEndpoint: audited('WEBHOOK_UPDATED', 'WEBHOOK', { resourceId: webhookId }, async (req, res) => { res.json({ success: true, data: await service.updateEndpoint(req.params.webhookId, req.body, context(req)) }); }),
  rotateSecret: audited('WEBHOOK_SECRET_ROTATED', 'WEBHOOK', { resourceId: webhookId }, async (req, res) => { noStore(res); res.json({ success: true, data: await service.rotateSecret(req.params.webhookId, context(req)) }); }),
  testEndpoint: audited('WEBHOOK_TESTED', 'WEBHOOK', { resourceId: webhookId }, async (req, res) => { res.status(202).json({ success: true, data: await service.testEndpoint(req.params.webhookId, context(req)) }); }),
  async listDeliveries(req, res) { res.json({ success: true, data: await service.listDeliveries(req.query) }); },
  async deliveryDetail(req, res) { res.json({ success: true, data: await service.deliveryDetail(req.params.deliveryId, req.query.tenantId) }); },
  replay: audited('WEBHOOK_DELIVERY_REPLAYED', 'WEBHOOK_DELIVERY', { resourceId: deliveryId }, async (req, res) => { res.status(202).json({ success: true, data: await service.replay(req.params.deliveryId, req.body, context(req)) }); }),
};
