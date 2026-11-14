const express = require('express');
const asyncHandler = require('../http/asyncHandler');
const { createAiScoringAdminClient } = require('../clients/aiScoringAdminClient');
const HttpError = require('../http/httpError');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Tenant scope is server-side deployment configuration bound to the Admin service
// credential; it is never read from the incoming browser request.
function parseTenantScope(value) {
  const tenantIds = [...new Set(String(value || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean))];
  if (tenantIds.some(tenantId => !UUID_PATTERN.test(tenantId))) {
    throw new Error('AI_SCORING_ADMIN_TENANT_IDS must be a comma-separated list of tenant UUIDs.');
  }
  return tenantIds;
}

function forwardedHeaders(req, tenantIds = []) {
  const permissions = (req.auth?.permissions || []).filter(permission => permission.startsWith('ai_scoring.'));
  const headers = {
    'x-request-id': req.requestId,
    'x-admin-actor-id': req.auth?.userId || '',
    'x-admin-actor-email': req.user?.email || '',
    'x-admin-permissions': permissions.join(','),
    'x-admin-tenant-ids': permissions.length > 0 ? tenantIds.join(',') : '',
  };
  const idempotencyKey = req.get('idempotency-key');
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  return headers;
}

function createAiScoringAdminProxyRoutes(options = {}) {
  const router = express.Router();
  const client = options.client || createAiScoringAdminClient();
  const tenantIds = parseTenantScope(options.tenantIds ?? process.env.AI_SCORING_ADMIN_TENANT_IDS);
  router.use(asyncHandler(async (req, res) => {
    if (tenantIds.length === 0) {
      throw new HttpError('AI Scoring Admin tenant scope is not configured.', 503, 'AI_SCORING_ADMIN_TENANT_SCOPE_NOT_CONFIGURED');
    }
    const response = await client.request({
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body,
      headers: forwardedHeaders(req, tenantIds),
    });
    for (const header of ['content-type', 'content-disposition', 'x-request-id']) {
      if (response.headers?.[header]) res.setHeader(header, response.headers[header]);
    }
    return res.status(response.status).send(response.data);
  }));
  return router;
}

module.exports = { createAiScoringAdminProxyRoutes, forwardedHeaders, parseTenantScope };
