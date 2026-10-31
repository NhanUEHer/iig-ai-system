const db = require('../config/db');
const iigClient = require('../clients/iigClient');

const REFRESH_SKEW_MS = 2 * 60 * 1000;

/**
 * Decodes a JWT token payload without external libraries
 */
function decodeToken(token) {
  try {
    const cleanToken = token.replace('Bearer ', '').trim();
    const parts = cleanToken.split('.');
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Failed to decode JWT:', error.message);
    return null;
  }
}

function tokenExpiration(token) {
  const payload = decodeToken(token);
  if (!payload?.exp || !Number.isFinite(Number(payload.exp))) return null;
  return new Date(Number(payload.exp) * 1000);
}

function createTokenManager({ database = db, client = iigClient, now = () => new Date() } = {}) {
  let refreshPromise = null;

  return {
    /**
     * Main function to ensure a fresh, active access token is returned.
     * Checks the database first, then reads the admin SSO session when refresh is needed.
     */
    async ensureFreshToken() {
      const res = await database.query(
        'SELECT access_token, expired_at FROM tokens ORDER BY id DESC LIMIT 1'
      );

      let token = null;
      let needsRefresh = true;

      if (res.rows.length > 0) {
        token = res.rows[0].access_token;
        const dbExpiration = new Date(res.rows[0].expired_at);
        const jwtExpiration = tokenExpiration(token);
        const effectiveExpiration = jwtExpiration && jwtExpiration < dbExpiration ? jwtExpiration : dbExpiration;
        needsRefresh = !Number.isFinite(effectiveExpiration.getTime()) ||
          effectiveExpiration.getTime() <= now().getTime() + REFRESH_SKEW_MS;
        console.log(needsRefresh
          ? '🔑 Cached IIG token is expired or near expiry. Refreshing...'
          : '🔑 Found valid cached IIG token in DB');
      } else {
        console.log('🔑 No cached IIG token found in DB. Reading admin SSO session...');
      }

      if (needsRefresh) {
        if (!refreshPromise) {
          refreshPromise = this.refreshAccessToken().finally(() => { refreshPromise = null; });
        }
        token = await refreshPromise;
      }

      return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    },

    /**
     * Reads the admin SSO session and saves its access token to the database.
     */
    async refreshAccessToken() {
      console.log('🔄 Requesting IIG token from admin SSO session...');
      const session = await client.getAdminSession();
      const token = session?.accessToken;

      if (!token) {
        throw new Error('No accessToken returned by IIG admin session API.');
      }

      const expiredAt = tokenExpiration(token);
      if (!expiredAt) {
        throw new Error('IIG admin session returned an access token without a valid exp claim.');
      }
      if (expiredAt.getTime() <= now().getTime() + REFRESH_SKEW_MS) {
        const reason = session?.error ? ` (${session.error})` : '';
        throw new Error(`IIG admin session returned an expired or near-expiry access token${reason}.`);
      }

      await database.query(
        'INSERT INTO tokens (access_token, expired_at, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
        [token, expiredAt]
      );
      console.log('✅ New token saved to database successfully.');

      return token;
    }
  };
}

const tokenManager = createTokenManager();
tokenManager.createTokenManager = createTokenManager;
tokenManager.decodeToken = decodeToken;
tokenManager.tokenExpiration = tokenExpiration;

module.exports = tokenManager;
