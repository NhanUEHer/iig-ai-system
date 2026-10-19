const IDLE_TTL_MS = 24 * 60 * 60 * 1000;
const ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function jwtSecret(env = process.env) {
  if (env.JWT_SECRET?.length >= 32) return env.JWT_SECRET;
  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must contain at least 32 characters in production.');
  }
  return 'development-only-jwt-secret-change-me-now';
}

module.exports = { IDLE_TTL_MS, ABSOLUTE_TTL_MS, jwtSecret };
