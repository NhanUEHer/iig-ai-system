const crypto = require('node:crypto');

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function generate() {
  return crypto.randomBytes(32).toString('base64url');
}

function hash(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

function isWellFormed(token) {
  return TOKEN_PATTERN.test(String(token || ''));
}

function hashesEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'hex');
  const rightBuffer = Buffer.from(String(right || ''), 'hex');
  return leftBuffer.length === 32
    && rightBuffer.length === 32
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = { generate, hash, isWellFormed, hashesEqual, TOKEN_PATTERN };
