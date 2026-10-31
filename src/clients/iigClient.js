const axios = require('axios');
const crypto = require('node:crypto');
const sourceAuthTokenRepository = require('../modules/iig-ingestion/iigSourceAuthTokenRepository');
require('dotenv').config();

const DEFAULT_IIG_API_URL = 'https://elearningapi.iigvietnam.com';
const DEFAULT_IIG_ADMIN_URL = 'https://elearning-admin.iigvn.com';
const DEFAULT_IIG_SSO_LOGIN_URL = 'https://sso.iigvietnam.com/v1/api/auth/login';
const DEFAULT_IIG_SSO_CONSENT_URL = 'https://sso.iigvietnam.com/v1/api/oauth/consent';
const DEFAULT_IIG_SSO_TOKEN_URL = 'https://ssoapi.iigvietnam.com/api/oauth/token';
const DEFAULT_IIG_SSO_CLIENT_ID = 'elearning_admin';
const DEFAULT_IIG_SSO_SCOPE = 'openid profile email read';
const DEFAULT_IIG_SSO_REDIRECT_URI = 'https://elearning-admin.iigvn.com/callback';
const DEFAULT_REQUEST_TIMEOUT_MS = 120000;
const DEFAULT_TOKEN_TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_REFRESH_SKEW_SECONDS = 5 * 60;

class IigClientConfigurationError extends Error {
  constructor(message, code = 'IIG_DIRECT_AUTH_NOT_CONFIGURED') {
    super(message);
    this.name = 'IigClientConfigurationError';
    this.code = code;
    this.retryable = false;
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function decodeJwtExpiryMs(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const expiresAt = Number(payload.exp) * 1000;
    return Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : null;
  } catch {
    return null;
  }
}

function extractAccessToken(payload) {
  const candidates = [
    payload?.access_token,
    payload?.accessToken,
    payload?.token,
    payload?.data?.access_token,
    payload?.data?.accessToken,
    payload?.data?.token,
    payload?.result?.access_token,
    payload?.result?.accessToken,
    payload?.result?.token,
  ];
  return candidates.find(value => typeof value === 'string' && value.trim())?.trim() || null;
}

function extractRefreshToken(payload) {
  const candidates = [
    payload?.refresh_token,
    payload?.refreshToken,
    payload?.data?.refresh_token,
    payload?.data?.refreshToken,
    payload?.result?.refresh_token,
    payload?.result?.refreshToken,
  ];
  return candidates.find(value => typeof value === 'string' && value.trim())?.trim() || null;
}

function extractExpiresAtMs(payload, token, now, fallbackTtlMs) {
  const candidates = [
    payload?.expiredDate,
    payload?.expiresAt,
    payload?.data?.expiredDate,
    payload?.data?.expiresAt,
    payload?.result?.expiredDate,
    payload?.result?.expiresAt,
  ];
  for (const value of candidates) {
    if (value === null || value === undefined || value === '') continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric < 1e12 ? numeric * 1000 : numeric;
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  const expiresInCandidates = [
    payload?.expires_in,
    payload?.expiresIn,
    payload?.data?.expires_in,
    payload?.data?.expiresIn,
    payload?.result?.expires_in,
    payload?.result?.expiresIn,
  ];
  for (const value of expiresInCandidates) {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds > 0) return now + (seconds * 1000);
  }
  return decodeJwtExpiryMs(token) || (now + fallbackTtlMs);
}

function oauthRejected(error) {
  const status = Number(error?.response?.status);
  const oauthError = String(error?.response?.data?.error || '').trim().toLowerCase();
  return [400, 401, 403].includes(status) || [
    'invalid_grant',
    'invalid_client',
    'unauthorized_client',
  ].includes(oauthError);
}

function mergeSetCookies(currentCookie, setCookieHeaders = []) {
  const cookies = new Map();
  for (const pair of String(currentCookie || '').split(';')) {
    const trimmed = pair.trim();
    const separator = trimmed.indexOf('=');
    if (separator > 0) cookies.set(trimmed.slice(0, separator), trimmed.slice(separator + 1));
  }
  for (const header of setCookieHeaders) {
    const pair = String(header).split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

class IigDirectClient {
  constructor({
    http = axios,
    env = process.env,
    now = () => Date.now(),
    tokenStore = sourceAuthTokenRepository,
    stateFactory = () => crypto.randomUUID(),
  } = {}) {
    this.http = http;
    this.env = env;
    this.now = now;
    this.tokenStore = tokenStore;
    this.stateFactory = stateFactory;
    this.cachedTokens = null;
    this.authPromise = null;
    this.adminSessionCookie = String(env.IIG_ADMIN_SESSION_COOKIE || '').trim();
  }

  config() {
    return {
      apiUrl: String(this.env.IIG_API_URL || DEFAULT_IIG_API_URL).replace(/\/$/, ''),
      adminUrl: String(this.env.IIG_ADMIN_URL || DEFAULT_IIG_ADMIN_URL).replace(/\/$/, ''),
      loginUrl: String(this.env.IIG_SSO_LOGIN_URL || DEFAULT_IIG_SSO_LOGIN_URL).trim(),
      consentUrl: String(this.env.IIG_SSO_CONSENT_URL || DEFAULT_IIG_SSO_CONSENT_URL).trim(),
      tokenUrl: String(this.env.IIG_SSO_TOKEN_URL || DEFAULT_IIG_SSO_TOKEN_URL).trim(),
      clientId: String(this.env.IIG_SSO_CLIENT_ID || DEFAULT_IIG_SSO_CLIENT_ID).trim(),
      clientSecret: String(this.env.IIG_SSO_CLIENT_SECRET || '').trim(),
      scope: String(this.env.IIG_SSO_SCOPE || DEFAULT_IIG_SSO_SCOPE).trim(),
      redirectUri: String(
        this.env.IIG_SSO_REDIRECT_URI || DEFAULT_IIG_SSO_REDIRECT_URI
      ).trim(),
      authorizationCode: String(this.env.IIG_SSO_AUTHORIZATION_CODE || '').trim(),
      initialRefreshToken: String(this.env.IIG_SSO_INITIAL_REFRESH_TOKEN || '').trim(),
      username: String(this.env.IIG_SSO_USERNAME || '').trim(),
      password: String(this.env.IIG_SSO_PASSWORD || '').trim(),
      timeoutMs: positiveInteger(this.env.IIG_SOURCE_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS),
      adminTimeoutMs: positiveInteger(
        this.env.IIG_ADMIN_REQUEST_TIMEOUT_MS,
        DEFAULT_REQUEST_TIMEOUT_MS
      ),
      tokenTtlMs: positiveInteger(
        this.env.IIG_SSO_TOKEN_TTL_SECONDS || this.env.IIG_ELEARNING_TOKEN_TTL_SECONDS,
        DEFAULT_TOKEN_TTL_SECONDS
      ) * 1000,
      refreshSkewMs: positiveInteger(
        this.env.IIG_SSO_TOKEN_REFRESH_SKEW_SECONDS || this.env.IIG_ELEARNING_TOKEN_REFRESH_SKEW_SECONDS,
        DEFAULT_REFRESH_SKEW_SECONDS
      ) * 1000,
    };
  }

  requireAdminProxyConfig() {
    const config = this.config();
    if (!this.adminSessionCookie) {
      throw new IigClientConfigurationError(
        'IIG_ADMIN_SESSION_COOKIE is required for the IIG Admin batch-detail proxy.',
        'IIG_ADMIN_SESSION_NOT_CONFIGURED'
      );
    }
    return config;
  }

  retainAdminCookies(response) {
    const setCookieHeaders = response.headers?.['set-cookie'];
    if (Array.isArray(setCookieHeaders) && setCookieHeaders.length > 0) {
      this.adminSessionCookie = mergeSetCookies(this.adminSessionCookie, setCookieHeaders);
    }
    return response;
  }

  async requestAdmin(path, requestConfig = {}) {
    const config = this.requireAdminProxyConfig();
    const response = await this.http.request({
      ...requestConfig,
      url: `${config.adminUrl}${path}`,
      timeout: requestConfig.timeout || config.adminTimeoutMs,
      headers: {
        accept: 'application/json',
        cookie: this.adminSessionCookie,
        ...requestConfig.headers,
      },
    });
    return this.retainAdminCookies(response);
  }

  requireAuthConfig() {
    const config = this.config();
    const missing = [];
    if (!config.loginUrl) missing.push('IIG_SSO_LOGIN_URL');
    if (!config.consentUrl) missing.push('IIG_SSO_CONSENT_URL');
    if (!config.tokenUrl) missing.push('IIG_SSO_TOKEN_URL');
    if (!config.clientId) missing.push('IIG_SSO_CLIENT_ID');
    if (!config.redirectUri) missing.push('IIG_SSO_REDIRECT_URI');
    if (missing.length) {
      throw new IigClientConfigurationError(`Missing IIG SSO variables: ${missing.join(', ')}.`);
    }
    return config;
  }

  invalidateAccessToken() {
    if (this.cachedTokens) this.cachedTokens.accessToken = null;
  }

  tokenIsFresh(config) {
    return Boolean(
      this.cachedTokens?.accessToken &&
      this.cachedTokens.expiresAtMs - config.refreshSkewMs > this.now()
    );
  }

  jsonHeaders(extra = {}) {
    return {
      accept: 'application/json',
      'content-type': 'application/json',
      ...extra,
    };
  }

  async loadPersistedTokens() {
    if (this.cachedTokens) return this.cachedTokens;
    this.cachedTokens = await this.tokenStore.load() || {
      accessToken: null,
      refreshToken: null,
      expiresAtMs: null,
    };
    return this.cachedTokens;
  }

  async saveAuthResponse(payload, { fallbackRefreshToken = null } = {}) {
    const config = this.requireAuthConfig();
    const accessToken = extractAccessToken(payload);
    if (!accessToken) {
      const error = new Error('IIG authentication succeeded without an access token.');
      error.code = 'IIG_LOGIN_TOKEN_MISSING';
      error.retryable = false;
      throw error;
    }
    const tokens = {
      accessToken,
      refreshToken: extractRefreshToken(payload) || fallbackRefreshToken,
      expiresAtMs: extractExpiresAtMs(payload, accessToken, this.now(), config.tokenTtlMs),
    };
    await this.tokenStore.save(tokens);
    this.cachedTokens = tokens;
    return accessToken;
  }

  async login() {
    const config = this.requireAuthConfig();
    if (!config.username || !config.password) {
      throw new IigClientConfigurationError(
        'IIG SSO has no persisted refresh token and no configured bootstrap grant.',
        'IIG_SSO_BOOTSTRAP_NOT_CONFIGURED'
      );
    }
    const loginResponse = await this.http.request({
      method: 'post',
      url: config.loginUrl,
      timeout: config.timeoutMs,
      headers: this.jsonHeaders(),
      data: {
        userName: config.username,
        password: config.password,
        clientId: config.clientId,
        returnUrl: config.redirectUri,
      },
    });
    const loginPayload = loginResponse.data?.data || loginResponse.data || {};
    if (loginPayload.mfaRequired) {
      throw new IigClientConfigurationError(
        'IIG SSO requires interactive MFA for the configured account.',
        'IIG_SSO_MFA_REQUIRED'
      );
    }
    const userId = String(loginPayload.userId || '').trim();
    const sessionToken = String(loginPayload.sessionToken || '').trim();
    if (!userId || !sessionToken) {
      const error = new Error('IIG SSO login succeeded without userId or sessionToken.');
      error.code = 'IIG_SSO_SESSION_MISSING';
      error.retryable = false;
      throw error;
    }

    const state = this.stateFactory();
    const consentResponse = await this.http.request({
      method: 'post',
      url: config.consentUrl,
      timeout: config.timeoutMs,
      headers: this.jsonHeaders({ 'X-Session-Token': sessionToken }),
      data: {
        userId,
        clientId: config.clientId,
        scope: config.scope,
        state,
        redirectUri: config.redirectUri,
        approved: true,
      },
    });
    const consentPayload = consentResponse.data?.data || consentResponse.data || {};
    const redirectUrl = String(consentPayload.redirectUrl || '').trim();
    let redirect;
    try {
      redirect = new URL(redirectUrl);
    } catch {
      redirect = null;
    }
    const code = redirect?.searchParams.get('code') || '';
    const returnedState = redirect?.searchParams.get('state') || '';
    if (!code || returnedState !== state) {
      const error = new Error('IIG SSO consent did not return a valid authorization code and state.');
      error.code = 'IIG_SSO_AUTHORIZATION_CODE_INVALID';
      error.retryable = false;
      throw error;
    }
    return this.exchangeAuthorizationCode(code);
  }

  async exchangeAuthorizationCode(code) {
    const config = this.requireAuthConfig();
    if (!config.redirectUri) {
      throw new IigClientConfigurationError(
        'IIG_SSO_REDIRECT_URI is required to exchange an authorization code.',
        'IIG_SSO_REDIRECT_URI_NOT_CONFIGURED'
      );
    }
    const response = await this.http.request({
      method: 'post',
      url: config.tokenUrl,
      timeout: config.timeoutMs,
      headers: this.jsonHeaders(),
      data: {
        grantType: 'authorization_code',
        code,
        redirectUri: config.redirectUri,
        clientId: config.clientId,
        ...(config.clientSecret ? { clientSecret: config.clientSecret } : {}),
      },
    });
    return this.saveAuthResponse(response.data);
  }

  async refresh(refreshToken) {
    const config = this.requireAuthConfig();
    const response = await this.http.request({
      method: 'post',
      url: config.tokenUrl,
      timeout: config.timeoutMs,
      headers: this.jsonHeaders(),
      data: {
        grantType: 'refresh_token',
        refreshToken,
        clientId: config.clientId,
        ...(config.clientSecret ? { clientSecret: config.clientSecret } : {}),
      },
    });
    return this.saveAuthResponse(response.data, { fallbackRefreshToken: refreshToken });
  }

  async acquireAccessToken({ forceRelogin = false, forceRefresh = false } = {}) {
    const config = this.requireAuthConfig();
    await this.loadPersistedTokens();
    if (!forceRelogin && !forceRefresh && this.tokenIsFresh(config)) return this.cachedTokens.accessToken;
    const refreshToken = this.cachedTokens?.refreshToken || config.initialRefreshToken;
    if (!forceRelogin && refreshToken) {
      try {
        return await this.refresh(refreshToken);
      } catch (error) {
        if (!oauthRejected(error)) throw error;
        // An explicitly rejected refresh token can be replaced through an SSO bootstrap grant.
      }
    }
    if (!forceRelogin && config.authorizationCode) {
      return this.exchangeAuthorizationCode(config.authorizationCode);
    }
    return this.login();
  }

  async getAccessToken({ forceRelogin = false, forceRefresh = false } = {}) {
    this.requireAuthConfig();
    if (!this.authPromise) {
      this.authPromise = this.acquireAccessToken({ forceRelogin, forceRefresh })
        .finally(() => { this.authPromise = null; });
    }
    return this.authPromise;
  }

  directHeaders(token, extra = {}) {
    return {
      accept: 'application/json',
      authorization: `Bearer ${String(token).replace(/^Bearer\s+/i, '').trim()}`,
      category: 'admin',
      domain: 'iig',
      ...extra,
    };
  }

  async authenticatedRequest(config, canRefresh = true) {
    const token = await this.getAccessToken();
    try {
      return await this.http.request({
        ...config,
        timeout: config.timeout || this.config().timeoutMs,
        headers: this.directHeaders(token, config.headers),
      });
    } catch (error) {
      if (canRefresh && [401, 403].includes(Number(error?.response?.status))) {
        this.invalidateAccessToken();
        const refreshedToken = await this.getAccessToken({ forceRefresh: true });
        return this.http.request({
          ...config,
          timeout: config.timeout || this.config().timeoutMs,
          headers: this.directHeaders(refreshedToken, config.headers),
        });
      }
      throw error;
    }
  }

  async getAdminSession() {
    const response = await this.requestAdmin('/api/auth/session', { method: 'get' });
    return response.data;
  }

  async listMocktestScorings(payload) {
    return this.searchScoringList(payload);
  }

  async fetchMocktestScoringBatchDetail(scoringIds, { isScoring = false } = {}) {
    const ids = [...new Set((Array.isArray(scoringIds) ? scoringIds : [scoringIds])
      .map(value => String(value || '').trim())
      .filter(Boolean))];
    if (!ids.length) throw new Error('At least one IIG scoring ID is required.');
    const response = await this.requestAdmin('/api/admin-proxy/mocktest-scorings/batch-detail', {
      method: 'post',
      data: { ids, isScoring: Boolean(isScoring) },
      headers: { 'content-type': 'application/json' },
    });
    return response.data;
  }

  getFileViewUrl(fileId) {
    const normalizedFileId = String(fileId || '').trim();
    if (!normalizedFileId) throw new Error('An IIG file ID is required.');
    return `${this.config().apiUrl}/file/api/file-upload/${encodeURIComponent(normalizedFileId)}/view`;
  }

  async searchScoringList(payload) {
    const response = await this.authenticatedRequest({
      method: 'post',
      url: `${this.config().apiUrl}/api-admin-old/api/Scoring`,
      data: payload,
      headers: { 'content-type': 'application/json' },
    });
    return response.data;
  }

  async fetchCourseScoringDetail(courseScoringId) {
    return this.fetchMocktestScoringBatchDetail([courseScoringId]);
  }

  async fetchQuestionDetails(chooseId) {
    const response = await this.authenticatedRequest({
      method: 'get',
      url: `${this.config().apiUrl}/api-admin-old/api/Scoring/scoring/question/detail`,
      params: { chooseId },
    });
    return response.data;
  }

  async getMigratedFileUrl(fileId, _token, { throwOnError = false } = {}) {
    try {
      const token = await this.getAccessToken();
      const response = await this.authenticatedRequest({
        method: 'get',
        url: `${this.config().apiUrl}/api-admin-old/api/FileUploader/get-info-migrate-file/${encodeURIComponent(fileId)}`,
        params: { access_token: token },
      });
      return response.data?.tempUrl || null;
    } catch (error) {
      if (throwOnError) throw error;
      return null;
    }
  }
}

const iigClient = new IigDirectClient();
iigClient.IigDirectClient = IigDirectClient;
iigClient.IigClientConfigurationError = IigClientConfigurationError;
iigClient.decodeJwtExpiryMs = decodeJwtExpiryMs;
iigClient.extractAccessToken = extractAccessToken;
iigClient.extractRefreshToken = extractRefreshToken;
iigClient.extractExpiresAtMs = extractExpiresAtMs;
iigClient.oauthRejected = oauthRejected;

module.exports = iigClient;
