const { timingSafeEqual } = require('node:crypto');
const HttpError = require('../http/httpError');

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parsePermissions(value) {
  return String(value || '')
    .split(',')
    .map(permission => permission.trim())
    .filter(permission => /^ai_scoring\.[a-z0-9_.-]+$/i.test(permission));
}

function authenticateAiScoringService(req, res, next) {
  try {
    const configuredToken = process.env.AI_SCORING_ADMIN_SERVICE_TOKEN;
    if (!configuredToken) {
      throw new HttpError('AI Scoring service authentication is not configured.', 503, 'AI_SCORING_SERVICE_AUTH_NOT_CONFIGURED');
    }

    const authorization = req.get('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token || !safeEqual(token, configuredToken)) {
      throw new HttpError('AI Scoring service authentication failed.', 401, 'AI_SCORING_SERVICE_AUTH_FAILED');
    }

    const userId = req.get('x-admin-actor-id') || 'system';
    const email = req.get('x-admin-actor-email') || null;
    const permissions = parsePermissions(req.get('x-admin-permissions'));
    req.auth = {
      service: 'iig-admin-bff',
      userId,
      permissions,
      roles: [],
    };
    req.user = { id: userId, email, permissions };
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { authenticateAiScoringService, parsePermissions };
