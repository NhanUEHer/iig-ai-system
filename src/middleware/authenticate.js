const authRepository = require('../modules/auth/authRepository');
const { verifyAccessToken, signAccessToken } = require('../modules/auth/tokenService');
const { IDLE_TTL_MS } = require('../modules/auth/authConfig');
const HttpError = require('../http/httpError');
const roleRepository = require('../modules/auth/roleRepository');

async function authenticate(req, res, next) {
  try {
    const authorization = req.get('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) throw new HttpError('Phiên đăng nhập không hợp lệ.', 401, 'AUTH_REQUIRED');

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (error) {
      throw new HttpError('Phiên đăng nhập đã hết hạn.', 401, 'TOKEN_EXPIRED');
    }

    const session = await authRepository.findActiveSession(payload.sid);
    const now = new Date();
    if (!session || !session.is_active || new Date(session.idle_expires_at) <= now ||
        new Date(session.absolute_expires_at) <= now) {
      throw new HttpError('Phiên đăng nhập đã hết hạn.', 401, 'SESSION_EXPIRED');
    }

    const absoluteExpiresAt = new Date(session.absolute_expires_at);
    const idleExpiresAt = new Date(Math.min(now.getTime() + IDLE_TTL_MS, absoluteExpiresAt.getTime()));
    await authRepository.extendSession(session.id, idleExpiresAt);
    const refreshedToken = signAccessToken({
      userId: session.user_id,
      sessionId: session.id,
      expiresAt: idleExpiresAt,
      absoluteExpiresAt
    });
    res.setHeader('x-access-token', refreshedToken);
    res.setHeader('x-token-expires-at', idleExpiresAt.toISOString());
    const roles = await roleRepository.findForUser(session.user_id);
    const primaryRole = roles.find(role => role.is_primary) || roles[0];
    const permissions = [...new Set(roles.flatMap(role => role.permissions || []))];
    const roleSlugs = roles.map(role => role.slug);
    req.auth = { userId: session.user_id, sessionId: session.id, role: primaryRole?.slug, roles: roleSlugs, permissions };
    req.user = {
      id: session.user_id,
      name: session.name,
      email: session.email,
      role: primaryRole?.slug || session.role,
      roleName: primaryRole?.name || session.role,
      roles: roles.map(({ id, slug, name, is_primary }) => ({ id, slug, name, isPrimary: is_primary })),
      permissions,
      forcePasswordChange: session.force_password_change
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireRole(...roles) {
  return (req, res, next) => roles.some(role => req.auth?.roles?.includes(role))
    ? next()
    : next(new HttpError('Bạn không có quyền thực hiện thao tác này.', 403, 'FORBIDDEN'));
}

function requirePermission(...required) {
  return (req, res, next) => required.some(permission => req.auth?.permissions?.includes(permission))
    ? next()
    : next(new HttpError('Bạn không có quyền thực hiện thao tác này.', 403, 'PERMISSION_DENIED'));
}

module.exports = { authenticate, requireRole, requirePermission };
