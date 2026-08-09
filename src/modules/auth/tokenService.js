const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('./authConfig');

function signAccessToken({ userId, sessionId, role, expiresAt, absoluteExpiresAt }) {
  return jwt.sign({
    sub: userId,
    sid: sessionId,
    role,
    exp: Math.floor(new Date(expiresAt).getTime() / 1000),
    absoluteExp: Math.floor(new Date(absoluteExpiresAt).getTime() / 1000)
  }, jwtSecret(), { algorithm: 'HS256' });
}

function verifyAccessToken(token) {
  return jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] });
}

function createActionToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

function hashActionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { signAccessToken, verifyAccessToken, createActionToken, hashActionToken };
