const express = require('express');
const asyncHandler = require('../../../http/asyncHandler');
const { requirePermission } = require('../../../middleware/authenticate');
const usageService = require('../admin/usageService');

function createUsageRouter(dependencies = {}) {
  const service = dependencies.usageService || usageService;
  const router = express.Router();
  router.get('/', requirePermission('ai_core.view', 'ai_core.manage'), asyncHandler(async (req, res) => {
    res.json({ data: await service.get(req.query) });
  }));
  return router;
}

module.exports = createUsageRouter();
module.exports.createUsageRouter = createUsageRouter;
