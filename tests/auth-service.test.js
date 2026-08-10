const assert = require('node:assert/strict');
const test = require('node:test');

const authService = require('../src/modules/auth/authService');
const { hashPassword, verifyPassword, validatePassword } = require('../src/modules/auth/passwordService');
const { verifyAccessToken } = require('../src/modules/auth/tokenService');

test('password service hashes passwords and enforces the policy', async () => {
  assert.match(validatePassword('short'), /10/);
  assert.match(validatePassword('onlylettersxx'), /chữ và số/);
  assert.equal(validatePassword('SecurePass123'), null);
  const hash = await hashPassword('SecurePass123');
  assert.notEqual(hash, 'SecurePass123');
  assert.equal(await verifyPassword('SecurePass123', hash), true);
});

test('login creates a 24-hour sliding session with a 7-day hard limit', async () => {
  // Keep the issued JWT valid regardless of the calendar date on which the
  // suite runs. A fixed historical timestamp makes verification expire over
  // time even though the session TTL calculation itself is correct.
  const now = new Date();
  const passwordHash = await hashPassword('SecurePass123');
  let sessionInput;
  const repository = {
    findUserByEmail: async () => ({
      id: 'user-1', name: 'Lan Phương', email: 'lan@example.com', role: 'user',
      is_active: true, force_password_change: false, password_hash: passwordHash
    }),
    createSession: async input => {
      sessionInput = input;
      return { id: 'session-1' };
    },
    touchLogin: async () => {}
  };
  const result = await authService.login({ email: 'lan@example.com', password: 'SecurePass123' }, {
    repository, now: () => now
  });
  assert.equal(new Date(sessionInput.idleExpiresAt) - now, 24 * 60 * 60 * 1000);
  assert.equal(new Date(sessionInput.absoluteExpiresAt) - now, 7 * 24 * 60 * 60 * 1000);
  const payload = verifyAccessToken(result.token);
  assert.equal(payload.sid, 'session-1');
  assert.equal(payload.sub, 'user-1');
});

test('login returns the union of permissions from every assigned role', async () => {
  const passwordHash = await hashPassword('SecurePass123');
  const repository = {
    findUserByEmail: async () => ({
      id: 'multi-role-user', name: 'Minh Anh', email: 'minh@example.com', role: 'content',
      is_active: true, force_password_change: false, password_hash: passwordHash
    }),
    createSession: async () => ({ id: 'multi-role-session' }),
    touchLogin: async () => {}
  };
  const roleRepository = {
    findForUser: async () => [
      { id: 'role-1', slug: 'content', name: 'Nội dung', is_primary: true, permissions: ['audio.view', 'audio.manage'] },
      { id: 'role-2', slug: 'scorer', name: 'Chấm bài', is_primary: false, permissions: ['audio.view', 'scoring.grade'] }
    ]
  };
  const result = await authService.login({ email: 'minh@example.com', password: 'SecurePass123' }, { repository, roleRepository });
  assert.deepEqual(result.user.roles.map(role => role.slug), ['content', 'scorer']);
  assert.deepEqual(result.user.permissions.sort(), ['audio.manage', 'audio.view', 'scoring.grade']);
  assert.equal(result.user.roleName, 'Nội dung');
});

test('forgot password does not reveal whether an email exists', async () => {
  const result = await authService.requestPasswordReset('missing@example.com', {
    repository: { findUserByEmail: async () => null }
  });
  assert.match(result.message, /Nếu email tồn tại/);
});

test('reset password rejects invalid or expired action tokens', async () => {
  await assert.rejects(
    () => authService.resetPassword({ token: 'expired', password: 'SecurePass123' }, {
      repository: { consumePasswordToken: async () => null }
    }),
    error => error.code === 'INVALID_TOKEN'
  );
});
