const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../auth/authConfig');
const HttpError = require('../../http/httpError');

function sign(payload, expiresAt, type) {
  return jwt.sign(
    { sub: payload.candidateId, eventId: payload.eventId, attemptId: payload.attemptId, type, exp: Math.floor(new Date(expiresAt).getTime() / 1000) },
    jwtSecret(),
    { algorithm: 'HS256' },
  );
}

function verify(token, expectedType) {
  try {
    const payload = jwt.verify(String(token || ''), jwtSecret(), { algorithms: ['HS256'] });
    if (payload.type !== expectedType || !payload.sub || !payload.eventId) throw new Error('Invalid token scope');
    return payload;
  } catch {
    throw new HttpError('Phiên đăng ký không hợp lệ hoặc đã hết hạn.', 401, 'INVALID_CANDIDATE_TOKEN');
  }
}

const signCandidateToken = (payload, expiresAt) => sign(payload, expiresAt, 'candidate');
const verifyCandidateToken = token => verify(token, 'candidate');
const signAttemptToken = (payload, expiresAt) => sign(payload, expiresAt, 'attempt');
const verifyAttemptToken = token => verify(token, 'attempt');

module.exports = { signCandidateToken, verifyCandidateToken, signAttemptToken, verifyAttemptToken };
