const crypto = require('node:crypto');

const { AiCoreError } = require('../errors');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const CACHE_TTL_MS = 5 * 60 * 1000;
const decryptedKeyCache = new Map();

function configError() {
  return new AiCoreError('CONFIG_MISSING', 'AI Core master key is not configured correctly.');
}

function parseVersion(value) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) throw configError();
  return version;
}

function currentVersion(env = process.env) {
  return env.AI_CORE_MASTER_KEY_CURRENT === undefined
    ? 1
    : parseVersion(env.AI_CORE_MASTER_KEY_CURRENT);
}

function decodeMasterKey(encoded) {
  if (typeof encoded !== 'string' || encoded.trim() === '') throw configError();

  const normalized = encoded.trim();
  const key = Buffer.from(normalized, 'base64');
  const canonical = key.toString('base64').replace(/=+$/, '');
  if (key.length !== 32 || canonical !== normalized.replace(/=+$/, '')) throw configError();
  return key;
}

function masterKeyForVersion(version, env = process.env) {
  const safeVersion = parseVersion(version);
  const versioned = env[`AI_CORE_MASTER_KEY_V${safeVersion}`];
  const encoded = versioned || (safeVersion === 1 ? env.AI_CORE_MASTER_KEY : undefined);
  return decodeMasterKey(encoded);
}

function isConfigured(env = process.env) {
  try {
    masterKeyForVersion(currentVersion(env), env);
    return true;
  } catch (_error) {
    return false;
  }
}

function encrypt(plainKey, options = {}) {
  if (typeof plainKey !== 'string' || plainKey.length === 0) throw configError();

  const env = options.env || process.env;
  const keyVersion = options.keyVersion === undefined
    ? currentVersion(env)
    : parseVersion(options.keyVersion);
  const masterKey = masterKeyForVersion(keyVersion, env);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv, { authTagLength: TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(plainKey, 'utf8'), cipher.final()]);

  return {
    ciphertext,
    iv,
    tag: cipher.getAuthTag(),
    last4: plainKey.slice(-4),
    keyVersion,
  };
}

function cacheKeyFor(row) {
  const id = row.connectionId || row.connection_id || row.id;
  const updatedAt = row.updatedAt || row.updated_at;
  if (!id || !updatedAt) return null;
  const timestamp = updatedAt instanceof Date ? updatedAt.toISOString() : String(updatedAt);
  return `${id}:${timestamp}`;
}

function decrypt(row, options = {}) {
  const now = options.now || Date.now;
  const cacheKey = cacheKeyFor(row);
  if (cacheKey) {
    const cached = decryptedKeyCache.get(cacheKey);
    if (cached && cached.expiresAt > now()) return cached.value;
    if (cached) decryptedKeyCache.delete(cacheKey);
  }

  try {
    const env = options.env || process.env;
    const masterKey = masterKeyForVersion(row.key_version ?? row.keyVersion, env);
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      masterKey,
      Buffer.from(row.api_key_iv ?? row.iv),
      { authTagLength: TAG_BYTES },
    );
    decipher.setAuthTag(Buffer.from(row.api_key_tag ?? row.tag));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(row.api_key_ciphertext ?? row.ciphertext)),
      decipher.final(),
    ]).toString('utf8');

    if (cacheKey) decryptedKeyCache.set(cacheKey, {
      value: plaintext,
      expiresAt: now() + CACHE_TTL_MS,
    });
    return plaintext;
  } catch (error) {
    if (error instanceof AiCoreError) throw error;
    throw configError();
  }
}

function clearCache() {
  decryptedKeyCache.clear();
}

module.exports = {
  encrypt,
  decrypt,
  isConfigured,
  clearCache,
  currentVersion,
  masterKeyForVersion,
  CACHE_TTL_MS,
};
