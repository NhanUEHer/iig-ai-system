const express = require('express');
const asyncHandler = require('../../../http/asyncHandler');
const HttpError = require('../../../http/httpError');
const { requirePermission } = require('../../../middleware/authenticate');
const agentService = require('../agents/agentService');
const aiCore = require('..');

function actor(req) { return req.auth?.userId || req.user?.id || null; }

function variables(body) {
  const value = body?.variables ?? {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError('variables must be an object.', 400, 'AI_CORE_VARIABLES_INVALID');
  }
  return value;
}

function createAgentsRouter(dependencies = {}) {
  const service = dependencies.agentService || agentService;
  const sdk = dependencies.aiCore || aiCore;
  const router = express.Router();

  router.get('/', requirePermission('ai_core.view', 'ai_core.manage'), asyncHandler(async (_req, res) => {
    res.json({ data: await service.list() });
  }));
  router.post('/', requirePermission('ai_core.manage'), asyncHandler(async (req, res) => {
    res.status(201).json({ data: await service.create(req.body || {}, actor(req)) });
  }));
  router.get('/:key/versions/:a/diff/:b', requirePermission('ai_core.view', 'ai_core.manage'), asyncHandler(async (req, res) => {
    res.json({ data: await service.diff(req.params.key, Number(req.params.a), Number(req.params.b)) });
  }));
  router.get('/:key/versions', requirePermission('ai_core.view', 'ai_core.manage'), asyncHandler(async (req, res) => {
    res.json({ data: await service.versions(req.params.key) });
  }));
  router.post('/:key/versions/:v/restore', requirePermission('ai_core.manage'), asyncHandler(async (req, res) => {
    res.status(201).json({ data: await service.restore(req.params.key, Number(req.params.v), actor(req)) });
  }));
  router.put('/:key/draft', requirePermission('ai_core.manage'), asyncHandler(async (req, res) => {
    res.json({ data: await service.saveDraft(req.params.key, req.body || {}, actor(req)) });
  }));
  router.post('/:key/test', requirePermission('ai_core.manage'), asyncHandler(async (req, res) => {
    // Optional test images: [{ mimeType, data: base64 }] — validated by the runtime.
    res.json({ data: await service.test(req.params.key, variables(req.body), actor(req), req.body?.images) });
  }));
  router.post('/:key/publish', requirePermission('ai_core.manage'), asyncHandler(async (req, res) => {
    res.json({ data: await service.publish(req.params.key, actor(req)) });
  }));
  router.post('/:key/run', requirePermission('ai_core.run'), asyncHandler(async (req, res) => {
    const ref = req.body?.ref || {};
    const refType = ref.type || ref.refType;
    const refId = ref.id || ref.refId;
    if ((refType !== undefined && (typeof refType !== 'string' || refType.length > 100))
        || (refId !== undefined && (typeof refId !== 'string' || refId.length > 500))) {
      throw new HttpError('ref is invalid.', 400, 'AI_CORE_INVALID_REF');
    }
    const result = await sdk.run(req.params.key, variables(req.body), {
      userId: actor(req), refType, refId,
    });
    res.json({ data: result });
  }));
  router.get('/:key', requirePermission('ai_core.view', 'ai_core.manage'), asyncHandler(async (req, res) => {
    const item = await service.get(req.params.key);
    if (!item) throw new HttpError('Agent not found.', 404, 'AI_CORE_AGENT_NOT_FOUND');
    res.json({ data: item });
  }));
  router.patch('/:key', requirePermission('ai_core.manage'), asyncHandler(async (req, res) => {
    res.json({ data: await service.update(req.params.key, req.body || {}, actor(req)) });
  }));

  return router;
}

module.exports = createAgentsRouter();
module.exports.createAgentsRouter = createAgentsRouter;
