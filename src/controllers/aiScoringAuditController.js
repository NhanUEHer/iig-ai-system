const service = require('../modules/ai-scoring-audit/auditService');
module.exports = {
  async list(req, res) { res.json({ success: true, data: await service.list(req.query) }); },
  async detail(req, res) { res.json({ success: true, data: await service.detail(req.params.eventId) }); },
};
