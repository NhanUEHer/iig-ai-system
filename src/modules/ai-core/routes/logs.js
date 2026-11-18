const express = require('express');
const asyncHandler = require('../../../http/asyncHandler');
const HttpError = require('../../../http/httpError');
const { requirePermission } = require('../../../middleware/authenticate');
const logService = require('../admin/logService');

function createLogsRouter(dependencies = {}) {
  const service = dependencies.logService || logService;
  const router = express.Router();

  router.get('/export', requirePermission('ai_core.view', 'ai_core.manage'), asyncHandler(async (req, res) => {
    const content = logService.csv(await service.exportRows(req.query));
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="ai-core-logs.csv"');
    res.send(`\uFEFF${content}`);
  }));

  router.get('/', requirePermission('ai_core.view', 'ai_core.manage'), asyncHandler(async (req, res) => {
    res.json({ data: await service.list(req.query) });
  }));

  router.get('/:id', requirePermission('ai_core.view', 'ai_core.manage'), asyncHandler(async (req, res) => {
    const includePreview = req.auth?.permissions?.includes('ai_core.manage') || false;
    const item = await service.detail(req.params.id, includePreview);
    if (!item) throw new HttpError('Call log not found.', 404, 'AI_CORE_LOG_NOT_FOUND');
    res.json({ data: item });
  }));

  return router;
}

module.exports = createLogsRouter();
module.exports.createLogsRouter = createLogsRouter;

