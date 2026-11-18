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
    providerAvailable: item.providerAvailable ?? null, syncedAt: item.syncedAt ?? null,
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
        contextWindow: numberValue(item.contextWindow, 'contextWindow', { min: 0, integer: true }),
        status: enumValue(item.status, 'status', ['active', 'disabled']),
      };
      const key = `${normalized.provider}\u0000${normalized.model}`;
      if (seen.has(key)) fail('The model list contains duplicates.', 'AI_CORE_DUPLICATE_MODEL');
      seen.add(key);
      return normalized;
    });
    const known = new Map((typeof store.list === 'function' ? await store.list() : []).map(row => [`${row.provider}\u0000${row.model}`, row]));
    for (const item of items) {
      if (item.status !== 'active') continue;
      if (known.get(`${item.provider}\u0000${item.model}`)?.providerAvailable === false) {
        fail(`${item.provider}/${item.model} is no longer offered by the provider.`, 'AI_CORE_MODEL_UNAVAILABLE');
      }
      if (!item.contextWindow) fail(`Set the context window of ${item.model} before enabling it.`, 'AI_CORE_INVALID_MODELS');
    }
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

  // Pull model lists from every active connection.
  router.post('/sync', requirePermission('ai_core.manage'), asyncHandler(async (req, res) => {
    const connectionStore = dependencies.connectionStore || require('../providers/connectionStore');
    const providerRegistry = dependencies.providers || require('../providers');
    const results = [];
    for (const summary of await connectionStore.list()) {
      if (summary.status !== 'active') continue;
      const connection = await connectionStore.getWithKey(summary.id);
      const check = await providerRegistry.get(connection.provider).check({ apiKey: connection.apiKey, baseUrl: connection.baseUrl });
      await connectionStore.saveCheck(connection.id, check);
      if (!check.ok) { results.push({ connection: summary.name, ok: false, error: check.error?.message || 'check failed' }); continue; }
      const synced = await store.syncProviderModels(connection.provider, check.modelDetails || (check.models || []).map(id => ({ id })));
      results.push({ connection: summary.name, ok: true, ...synced });
    }
    await auditLog.write({ resourceType: 'model', resourceId: 'all', action: 'model.synced', actorId: req.auth?.userId || null, fields: [] });
    res.json({ data: { results, models: (await store.list()).map(present) } });
  }));

  return router;
}

module.exports = createModelsRouter();
module.exports.createModelsRouter = createModelsRouter;
