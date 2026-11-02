const express = require('express');
const asyncHandler = require('../http/asyncHandler');
const { createAiScoringAdminClient } = require('../clients/aiScoringAdminClient');

function forwardedHeaders(req) {
  const permissions = (req.auth?.permissions || []).filter(permission => permission.startsWith('ai_scoring.'));
  const headers = {
    'x-request-id': req.requestId,
    'x-admin-actor-id': req.auth?.userId || '',
    'x-admin-actor-email': req.user?.email || '',
    'x-admin-permissions': permissions.join(','),
  };
  const idempotencyKey = req.get('idempotency-key');
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  return headers;
}

function createAiScoringAdminProxyRoutes(options = {}) {
  const router = express.Router();
  const client = options.client || createAiScoringAdminClient();
  router.use(asyncHandler(async (req, res) => {
    const response = await client.request({
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body,
      headers: forwardedHeaders(req),
    });
    for (const header of ['content-type', 'content-disposition', 'x-request-id']) {
      if (response.headers?.[header]) res.setHeader(header, response.headers[header]);
    }
    return res.status(response.status).send(response.data);
  }));
  return router;
}

module.exports = { createAiScoringAdminProxyRoutes, forwardedHeaders };
