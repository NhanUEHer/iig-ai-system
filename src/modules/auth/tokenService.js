const jwt = require('jsonwebtoken');
const { jwtSecret } = require('./authConfig');

function signAccessToken({ userId, sessionId, expiresAt, absoluteExpiresAt }) {
  return jwt.sign({
    sub: userId,
    sid: sessionId,
    exp: Math.floor(new Date(expiresAt).getTime() / 1000),
    absoluteExp: Math.floor(new Date(absoluteExpiresAt).getTime() / 1000)
  }, jwtSecret(), { algorithm: 'HS256' });
}

function verifyAccessToken(token) {
  return jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] });
}

module.exports = { signAccessToken, verifyAccessToken };
