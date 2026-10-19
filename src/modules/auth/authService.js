const authRepository = require('./authRepository');
const { hashPassword, verifyPassword, validatePassword, isBcryptHash } = require('./passwordService');
const { signAccessToken } = require('./tokenService');
const { IDLE_TTL_MS, ABSOLUTE_TTL_MS } = require('./authConfig');
const HttpError = require('../../http/httpError');
const roleRepository = require('./roleRepository');

const publicUser = (user, roles = []) => ({
  id: user.id,
  name: user.name || user.username,
  email: user.email,
  role: user.role,
  roleName: roles.find(role => role.is_primary)?.name || roles[0]?.name || user.role,
  roles: roles.map(({ id, slug, name, is_primary }) => ({ id, slug, name, isPrimary: is_primary })),
  forcePasswordChange: user.force_password_change,
  isActive: user.is_active
});

async function login(input, dependencies = {}) {
  const repository = dependencies.repository || authRepository;
  const now = dependencies.now?.() || new Date();
  if (!input.email || !input.password) {
    throw new HttpError('Email và mật khẩu là bắt buộc.', 400, 'VALIDATION_ERROR');
  }
  const user = await repository.findUserByEmail(input.email.trim());
  if (!user || !user.is_active) {
    throw new HttpError('Email hoặc mật khẩu không chính xác.', 401, 'INVALID_CREDENTIALS');
  }

  const storedHash = user.password_hash;
  const valid = storedHash
    ? await verifyPassword(input.password, storedHash)
    : user.password === input.password;
  if (!valid) throw new HttpError('Email hoặc mật khẩu không chính xác.', 401, 'INVALID_CREDENTIALS');

  if (!storedHash || !isBcryptHash(storedHash)) {
    await repository.setPassword(user.id, await hashPassword(input.password));
  }

  const idleExpiresAt = new Date(now.getTime() + IDLE_TTL_MS);
  const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_TTL_MS);
  const session = await repository.createSession({
    userId: user.id,
    idleExpiresAt,
    absoluteExpiresAt,
    userAgent: input.userAgent || null,
    ipAddress: input.ipAddress || null
  });
  await repository.touchLogin(user.id);
  const token = signAccessToken({
    userId: user.id,
    sessionId: session.id,
    expiresAt: idleExpiresAt,
    absoluteExpiresAt
  });
  const rolesRepository = dependencies.roleRepository || (dependencies.repository ? null : roleRepository);
  let assignedRoles = rolesRepository ? await rolesRepository.findForUser(user.id) : [];
  if (!assignedRoles.length && user.role) {
    const legacyRole = rolesRepository?.findBySlug ? await rolesRepository.findBySlug(user.role) : null;
    if (legacyRole) assignedRoles = [{ ...legacyRole, is_primary: true }];
  }
  const permissions = [...new Set(assignedRoles.flatMap(role => role.permissions || []))];
  return { user: { ...publicUser(user, assignedRoles), permissions }, token, expiresAt: idleExpiresAt, absoluteExpiresAt };
}

async function setUserPassword({ userId, password }, dependencies = {}) {
  const repository = dependencies.repository || authRepository;
  const validationError = validatePassword(password);
  if (validationError) throw new HttpError(validationError, 400, 'VALIDATION_ERROR');
  const user = await repository.findUserById(userId);
  if (!user) throw new HttpError('Không tìm thấy tài khoản.', 404, 'USER_NOT_FOUND');
  await repository.setPassword(userId, await hashPassword(password));
  await repository.revokeUserSessions(userId);
}

async function changePassword({ userId, currentPassword, newPassword }, dependencies = {}) {
  const repository = dependencies.repository || authRepository;
  const validationError = validatePassword(newPassword);
  if (!currentPassword || validationError) {
    throw new HttpError(validationError || 'Mật khẩu hiện tại là bắt buộc.', 400, 'VALIDATION_ERROR');
  }
  const user = await repository.findCredentialsById(userId);
  const valid = user?.password_hash
    ? await verifyPassword(currentPassword, user.password_hash)
    : user?.password === currentPassword;
  if (!valid) throw new HttpError('Mật khẩu hiện tại không chính xác.', 400, 'INVALID_PASSWORD');
  await repository.setPassword(userId, await hashPassword(newPassword));
  await repository.revokeUserSessions(userId);
}

module.exports = {
  login, setUserPassword, changePassword, publicUser
};
