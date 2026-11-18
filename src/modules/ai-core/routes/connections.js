const express = require('express');
const asyncHandler = require('../../../http/asyncHandler');
const HttpError = require('../../../http/httpError');
const { requirePermission } = require('../../../middleware/authenticate');
const connectionStore = require('../providers/connectionStore');
const providers = require('../providers');
const audit = require('../admin/audit');
const { provider, requiredString, optionalHttpsUrl, enumValue, fail } = require('../admin/validation');

function userId(req) { return req.auth?.userId || req.user?.id || null; }

function createConnectionsRouter(dependencies = {}) {
  const store = dependencies.connectionStore || connectionStore;
  const providerRegistry = dependencies.providers || providers;
  const auditLog = dependencies.audit || audit;
  const router = express.Router();

  router.get('/', requirePermission('ai_core.view', 'ai_core.manage'), asyncHandler(async (_req, res) => {
    res.json({ data: await store.list() });
  }));

  router.post('/', requirePermission('ai_core.manage'), asyncHandler(async (req, res) => {
    const body = req.body || {};
    const payload = {
      provider: provider(body.provider),
      name: requiredString(body.name, 'name', { max: 120 }),
      apiKey: requiredString(body.apiKey, 'apiKey', { min: 8, max: 512 }),
      baseUrl: optionalHttpsUrl(body.baseUrl),
      status: body.status === undefined ? 'active' : enumValue(body.status, 'status', ['active', 'disabled']),
    };
    const item = await store.create(payload, userId(req));
    await auditLog.write({
      resourceType: 'connection', resourceId: item.id, action: 'connection.created',
      actorId: userId(req), fields: ['provider', 'name', 'credential', 'baseUrl', 'status'],
    });
    res.status(201).json({ data: item });
  }));

  router.patch('/:id', requirePermission('ai_core.manage'), asyncHandler(async (req, res) => {
    const allowed = new Set(['name', 'apiKey', 'baseUrl', 'status']);
    const supplied = Object.keys(req.body || {});
    if (!supplied.length || supplied.some(field => !allowed.has(field))) {
      fail('Patch contains no supported fields.', 'AI_CORE_INVALID_FIELD');
    }
    const patch = {};
    if (req.body.name !== undefined) patch.name = requiredString(req.body.name, 'name', { max: 120 });
    if (req.body.apiKey !== undefined) patch.apiKey = requiredString(req.body.apiKey, 'apiKey', { min: 8, max: 512 });
    if (req.body.baseUrl !== undefined) patch.baseUrl = optionalHttpsUrl(req.body.baseUrl);
    if (req.body.status !== undefined) patch.status = enumValue(req.body.status, 'status', ['active', 'disabled']);
    const item = await store.update(req.params.id, patch, userId(req));
    if (!item) throw new HttpError('Connection not found.', 404, 'AI_CORE_CONNECTION_NOT_FOUND');
    await auditLog.write({
      resourceType: 'connection', resourceId: item.id, action: 'connection.updated',
      actorId: userId(req), fields: supplied.map(field => field === 'apiKey' ? 'credential' : field),
    });
    res.json({ data: item });
  }));

  router.post('/:id/check', requirePermission('ai_core.manage'), asyncHandler(async (req, res) => {
    const connection = await store.getWithKey(req.params.id);
    if (!connection) throw new HttpError('Connection not found.', 404, 'AI_CORE_CONNECTION_NOT_FOUND');
    const result = await providerRegistry.get(connection.provider).check({
      apiKey: connection.apiKey, baseUrl: connection.baseUrl,
    });
    const saved = await store.saveCheck(connection.id, result);
    if (result.ok && (result.modelDetails || result.models)) {
      const priceStore = dependencies.priceStore || require('../pricing/prices');
      await priceStore.syncProviderModels(connection.provider, result.modelDetails || result.models.map(id => ({ id })));
    }
    res.json({ data: { ok: Boolean(result.ok), ms: result.ms, models: result.models || [], error: result.ok ? null : result.error, connection: saved } });
  }));

  return router;
}

module.exports = createConnectionsRouter();
module.exports.createConnectionsRouter = createConnectionsRouter;

