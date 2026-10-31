const crypto = require('node:crypto');
const db = require('../../config/db');

const PROVIDER = 'IIG_SSO_OAUTH';
const ENVELOPE_VERSION = 'v1';

class IigTokenEncryptionConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IigTokenEncryptionConfigurationError';
    this.code = 'IIG_TOKEN_ENCRYPTION_NOT_CONFIGURED';
    this.retryable = false;
  }
}

function encryptionKey(env = process.env) {
  const raw = String(
    env.IIG_SSO_TOKEN_ENCRYPTION_KEY || env.IIG_ELEARNING_TOKEN_ENCRYPTION_KEY || ''
  ).trim();
  let key = null;
  if (/^[a-f\d]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex');
  else if (raw) {
    try {
      key = Buffer.from(raw, 'base64');
    } catch {
      key = null;
    }
  }
  if (!key || key.length !== 32) {
    throw new IigTokenEncryptionConfigurationError(
      'IIG_SSO_TOKEN_ENCRYPTION_KEY must be a 32-byte key encoded as base64 or 64 hexadecimal characters.'
    );
  }
  return key;
}

function encryptToken(value, key) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENVELOPE_VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

function decryptToken(envelope, key) {
  if (!envelope) return null;
  const [version, ivValue, tagValue, ciphertextValue, ...extra] = String(envelope).split(':');
  if (version !== ENVELOPE_VERSION || !ivValue || !tagValue || !ciphertextValue || extra.length) {
    const error = new Error('Stored IIG token has an unsupported encryption envelope.');
    error.code = 'IIG_TOKEN_DECRYPTION_FAILED';
    error.retryable = false;
    throw error;
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    const error = new Error('Stored IIG token could not be decrypted with the configured key.');
    error.code = 'IIG_TOKEN_DECRYPTION_FAILED';
    error.retryable = false;
    throw error;
  }
}

class IigSourceAuthTokenRepository {
  constructor({ database = db, env = process.env } = {}) {
    this.db = database;
    this.env = env;
  }

  async load() {
    const result = await this.db.query(
      `SELECT access_token_encrypted, refresh_token_encrypted, expires_at
       FROM iig_source_auth_tokens
       WHERE provider = $1`,
      [PROVIDER]
    );
    const row = result.rows[0];
    if (!row) return null;
    const key = encryptionKey(this.env);
    return {
      accessToken: decryptToken(row.access_token_encrypted, key),
      refreshToken: decryptToken(row.refresh_token_encrypted, key),
      expiresAtMs: row.expires_at ? new Date(row.expires_at).getTime() : null,
    };
  }

  async save({ accessToken, refreshToken, expiresAtMs }) {
    const key = encryptionKey(this.env);
    await this.db.query(
      `INSERT INTO iig_source_auth_tokens
         (provider, access_token_encrypted, refresh_token_encrypted, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider) DO UPDATE
       SET access_token_encrypted = EXCLUDED.access_token_encrypted,
           refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
           expires_at = EXCLUDED.expires_at,
           updated_at = CURRENT_TIMESTAMP`,
      [
        PROVIDER,
        encryptToken(accessToken, key),
        encryptToken(refreshToken, key),
        Number.isFinite(expiresAtMs) ? new Date(expiresAtMs) : null,
      ]
    );
  }
}

const repository = new IigSourceAuthTokenRepository();
repository.IigSourceAuthTokenRepository = IigSourceAuthTokenRepository;
repository.IigTokenEncryptionConfigurationError = IigTokenEncryptionConfigurationError;
repository.encryptionKey = encryptionKey;
repository.encryptToken = encryptToken;
repository.decryptToken = decryptToken;

module.exports = repository;
