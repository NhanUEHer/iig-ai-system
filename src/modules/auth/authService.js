const authRepository = require('./authRepository');
const { hashPassword, verifyPassword, validatePassword, isBcryptHash } = require('./passwordService');
const { signAccessToken, createActionToken, hashActionToken } = require('./tokenService');
const { IDLE_TTL_MS, ABSOLUTE_TTL_MS, PASSWORD_TOKEN_TTL_MS } = require('./authConfig');
const emailService = require('../../services/emailService');
const HttpError = require('../../http/httpError');
const roleRepository = require('./roleRepository');

const publicUser = user => ({
  id: user.id,
  name: user.name || user.username,
  email: user.email,
  role: user.role,
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
    role: user.role,
    expiresAt: idleExpiresAt,
    absoluteExpiresAt
  });
  const roles = dependencies.roleRepository || (dependencies.repository ? null : roleRepository);
  const role = roles ? await roles.findBySlug(user.role) : null;
  return { user: { ...publicUser(user), roleName: role?.name || user.role, permissions: role?.permissions || [] }, token, expiresAt: idleExpiresAt, absoluteExpiresAt };
}

async function issuePasswordAction(user, purpose, dependencies = {}) {
  const repository = dependencies.repository || authRepository;
  const mailer = dependencies.emailService || emailService;
  const now = dependencies.now?.() || new Date();
  const { token, hash } = createActionToken();
  await repository.createPasswordToken({
    userId: user.id,
    tokenHash: hash,
    purpose,
    expiresAt: new Date(now.getTime() + PASSWORD_TOKEN_TTL_MS)
  });
  const baseUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
  const actionUrl = `${baseUrl}/${purpose === 'setup' ? 'setup-password' : 'reset-password'}?token=${encodeURIComponent(token)}`;
  return mailer.sendPasswordActionEmail({ email: user.email, name: user.name, actionUrl, purpose });
}

async function requestPasswordReset(email, dependencies = {}) {
  const repository = dependencies.repository || authRepository;
  if (!email) throw new HttpError('Email là bắt buộc.', 400, 'VALIDATION_ERROR');
  const user = await repository.findUserByEmail(email.trim());
  if (user?.is_active) await issuePasswordAction(user, 'reset', dependencies);
  return { message: 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.' };
}

async function resetPassword({ token, password }, dependencies = {}) {
  const repository = dependencies.repository || authRepository;
  const validationError = validatePassword(password);
  if (!token || validationError) {
    throw new HttpError(validationError || 'Token là bắt buộc.', 400, 'VALIDATION_ERROR');
  }
  const action = await repository.consumePasswordToken(hashActionToken(token));
  if (!action) throw new HttpError('Liên kết không hợp lệ hoặc đã hết hạn.', 400, 'INVALID_TOKEN');
  await repository.setPassword(action.user_id, await hashPassword(password));
  await repository.revokeUserSessions(action.user_id);
  return { purpose: action.purpose };
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
  login, issuePasswordAction, requestPasswordReset, resetPassword, changePassword, publicUser
};
