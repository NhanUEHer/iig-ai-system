const express = require('express');
const asyncHandler = require('../../../http/asyncHandler');
const { requirePermission } = require('../../../middleware/authenticate');
const prices = require('../pricing/prices');
const audit = require('../admin/audit');
const { provider, requiredString, enumValue, numberValue, fail } = require('../admin/validation');

function createModelsRouter(dependencies = {}) {
  const store = dependencies.priceStore || prices;
  const auditLog = dependencies.audit || audit;
  const router = express.Router();
  const present = item => ({
    provider: item.provider, model: item.model,
    priceIn: item.priceIn ?? item.in,
    priceCachedIn: item.priceCachedIn ?? item.cachedIn,
    priceOut: item.priceOut ?? item.out,
    contextWindow: item.contextWindow, effectiveFrom: item.effectiveFrom, status: item.status,
  });

  router.get('/', requirePermission('ai_core.view', 'ai_core.manage'), asyncHandler(async (_req, res) => {
    res.json({ data: (await store.list()).map(present) });
  }));

  router.put('/', requirePermission('ai_core.manage'), asyncHandler(async (req, res) => {
    const input = Array.isArray(req.body) ? req.body : req.body?.items;
    if (!Array.isArray(input) || input.length === 0 || input.length > 500) {
      fail('A non-empty model list with at most 500 items is required.', 'AI_CORE_INVALID_MODELS');
    }
    const seen = new Set();
    const items = input.map(item => {
      const normalized = {
        provider: provider(item.provider), model: requiredString(item.model, 'model', { max: 200 }),
        priceIn: numberValue(item.priceIn, 'priceIn'),
        priceCachedIn: numberValue(item.priceCachedIn, 'priceCachedIn'),
        priceOut: numberValue(item.priceOut, 'priceOut'),
        contextWindow: numberValue(item.contextWindow, 'contextWindow', { min: 1, integer: true }),
        status: enumValue(item.status, 'status', ['active', 'disabled']),
      };
      const key = `${normalized.provider}\u0000${normalized.model}`;
      if (seen.has(key)) fail('The model list contains duplicates.', 'AI_CORE_DUPLICATE_MODEL');
      seen.add(key);
      return normalized;
    });
    const saved = await store.saveMany(items);
    for (const item of saved) {
      await auditLog.write({
        resourceType: 'model', resourceId: `${item.provider}/${item.model}`, action: 'model.pricing_saved',
        actorId: req.auth?.userId || req.user?.id || null,
        fields: ['priceIn', 'priceCachedIn', 'priceOut', 'contextWindow', 'status'],
      });
    }
    res.json({ data: saved.map(present) });
  }));

  return router;
}

module.exports = createModelsRouter();
module.exports.createModelsRouter = createModelsRouter;
