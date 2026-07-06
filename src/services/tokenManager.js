const db = require('../config/db');
const iigClient = require('../clients/iigClient');

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

const tokenManager = {
  /**
   * Main function to ensure a fresh, active access token is returned.
   * Checks database first, logs in and refreshes if expired or older than 12 hours.
   */
  async ensureFreshToken() {
    // 1. Fetch latest token from DB
    const res = await db.query(
      'SELECT access_token, expired_at FROM tokens ORDER BY id DESC LIMIT 1'
    );
    
    let token = null;
    let needsRefresh = true;

    if (res.rows.length > 0) {
      token = res.rows[0].access_token;
      const expiredAt = new Date(res.rows[0].expired_at);
      
      // Parse token details
      const payload = decodeToken(token);
      if (payload && payload.iat) {
        const iatTime = payload.iat * 1000; // to milliseconds
        const twelveHoursInMs = 12 * 60 * 60 * 1000;
        const now = Date.now();
        
        // Token is fresh if:
        // - It hasn't reached twelve hours since issuance
        // - It hasn't expired according to database expired_at date
        if (now - iatTime < twelveHoursInMs && expiredAt > new Date()) {
          needsRefresh = false;
          console.log('🔑 Found valid cached token in DB');
        } else {
          console.log('🔑 Cached token is older than 12 hours or expired. Refreshing...');
        }
      }
    } else {
      console.log('🔑 No cached token found in DB. Requesting initial login...');
    }

    if (needsRefresh) {
      token = await this.refreshAccessToken();
    }

    return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  },

  /**
   * Performs the admin login flow and saves the new token to database
   */
  async refreshAccessToken() {
    console.log('🔄 Requesting new token from IIG Login API...');
    const loginData = await iigClient.loginAdmin();
    const token = loginData.token || loginData.accessToken;
    
    if (!token) {
      throw new Error('No token returned in login admin response');
    }

    // Set expiration 12 hours from now
    const expiredAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

    // Insert new token in DB
    await db.query(
      'INSERT INTO tokens (access_token, expired_at, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)',
      [token, expiredAt]
    );
    console.log('✅ New token saved to database successfully.');

    return token;
  }
};

module.exports = tokenManager;
