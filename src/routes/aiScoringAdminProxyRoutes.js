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

// Contract: every /api/admin/v1 call carries the target tenant as ?tenantId=. The browser
// may name a tenant, but only one inside the server-side scope; with a single configured
// tenant it is filled in. tenantId is stripped from bodies (Scoring rejects unknown fields).
function resolveTenant(req, tenantIds) {
  const requested = String(req.query?.tenantId ?? req.body?.tenantId ?? '').trim().toLowerCase();
  if (requested) {
    if (!tenantIds.includes(requested)) {
      throw new HttpError('The actor is not authorized for this tenant.', 403, 'AI_SCORING_TENANT_FORBIDDEN');
    }
    return requested;
  }
  if (tenantIds.length === 1) return tenantIds[0];
  throw new HttpError('tenantId is required when several tenants are in scope.', 400, 'AI_SCORING_TENANT_REQUIRED');
}

function forwardedRequest(req, tenantIds) {
  const tenantId = resolveTenant(req, tenantIds);
  // Drop empty filters (`status=`): Scoring validates every present field strictly.
  const query = Object.fromEntries(Object.entries(req.query || {}).filter(([, value]) => value !== '' && value != null));
  query.tenantId = tenantId;
  let body = req.body;
  if (body && typeof body === 'object' && !Array.isArray(body) && 'tenantId' in body) {
    const { tenantId: _ignored, ...rest } = body;
    body = rest;
  }
  return { query, body };
}

function createAiScoringAdminProxyRoutes(options = {}) {
  const router = express.Router();
  const client = options.client || createAiScoringAdminClient();
  const tenantIds = parseTenantScope(options.tenantIds ?? process.env.AI_SCORING_ADMIN_TENANT_IDS);
  router.use(asyncHandler(async (req, res) => {
    if (tenantIds.length === 0) {
      throw new HttpError('AI Scoring Admin tenant scope is not configured.', 503, 'AI_SCORING_ADMIN_TENANT_SCOPE_NOT_CONFIGURED');
    }
    const { query, body } = forwardedRequest(req, tenantIds);
    const response = await client.request({
      method: req.method,
      path: req.path,
      query,
      body,
      headers: forwardedHeaders(req, tenantIds),
    });
    for (const header of ['content-type', 'content-disposition', 'x-request-id']) {
      if (response.headers?.[header]) res.setHeader(header, response.headers[header]);
    }
    return res.status(response.status).send(response.data);
  }));
  return router;
}

module.exports = { createAiScoringAdminProxyRoutes, forwardedHeaders, forwardedRequest, parseTenantScope };
