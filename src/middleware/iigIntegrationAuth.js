const { createHash, timingSafeEqual } = require('node:crypto');
const HttpError = require('../http/httpError');
const credentialRepository = require('../modules/ai-scoring-credentials/credentialRepository');

function digest(value) {
  return createHash('sha256').update(String(value)).digest();
}

function digestHex(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function remoteAddress(req) {
  return String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

function createIigIntegrationAuth({
  apiKey = process.env.IIG_SCORING_INGESTION_API_KEY,
  ipAllowlist = process.env.IIG_SCORING_INGESTION_IP_ALLOWLIST,
  repository = credentialRepository,
} = {}) {
  const secret = String(apiKey || '').trim();
  const allowedIps = new Set(String(ipAllowlist || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean));

  return async function iigIntegrationAuth(req, res, next) {
    const authorization = req.get('authorization') || '';
    const provided = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!provided) {
      return next(new HttpError(
        'Integration authorization is required.',
        401,
        'INTEGRATION_AUTH_REQUIRED'
      ));
    }

    if (allowedIps.size && !allowedIps.has(remoteAddress(req))) {
      return next(new HttpError(
        'The request source is not allowed.',
        403,
        'INTEGRATION_SOURCE_NOT_ALLOWED'
      ));
    }

    const legacyMatch = secret.length >= 32 && timingSafeEqual(digest(provided), digest(secret));
    if (legacyMatch) {
      req.integration = {
        partner: 'IIG_ELEARNING', legacy: true,
        scopes: ['jobs:create', 'jobs:read', 'results:read', 'jobs:retry'],
      };
      return next();
    }

    try {
      const credential = await repository.findActiveByHash(digestHex(provided));
      if (!credential || credential.tenant_status !== 'ACTIVE') {
        return next(new HttpError('Integration authorization is invalid.', 403, 'INTEGRATION_AUTH_INVALID'));
      }
      req.integration = {
        partner: credential.tenant_code,
        tenantId: credential.tenant_id,
        credentialId: credential.id,
        scopes: credential.scopes || [],
        rateLimit: Number(credential.rate_limit_per_minute || 120),
      };
      await repository.touchLastUsed(credential.id);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function requireIntegrationScope(scope) {
  return (req, res, next) => req.integration?.scopes?.includes(scope)
    ? next()
    : next(new HttpError('Integration credential does not have the required scope.', 403, 'INTEGRATION_SCOPE_DENIED'));
}

function createIigIntegrationRateLimit({
  limit = Number(process.env.IIG_SCORING_INGESTION_RATE_LIMIT_PER_MINUTE || 120),
  windowMs = 60_000,
  now = () => Date.now(),
} = {}) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 120;
  const buckets = new Map();

  return function iigIntegrationRateLimit(req, res, next) {
    const timestamp = now();
    const key = `${req.integration?.partner || 'unknown'}:${remoteAddress(req) || 'unknown'}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= timestamp) {
      bucket = { count: 0, resetAt: timestamp + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    const effectiveLimit = Number.isInteger(req.integration?.rateLimit) && req.integration.rateLimit > 0
      ? req.integration.rateLimit : safeLimit;
    const remaining = Math.max(0, effectiveLimit - bucket.count);
    res.setHeader('x-ratelimit-limit', String(effectiveLimit));
    res.setHeader('x-ratelimit-remaining', String(remaining));
    res.setHeader('x-ratelimit-reset', new Date(bucket.resetAt).toISOString());
    if (bucket.count > effectiveLimit) {
      res.setHeader('retry-after', String(Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000))));
      return next(new HttpError(
        'Integration rate limit exceeded.',
        429,
        'INTEGRATION_RATE_LIMITED'
      ));
    }
    return next();
  };
}

module.exports = { createIigIntegrationAuth, createIigIntegrationRateLimit, requireIntegrationScope, remoteAddress };
