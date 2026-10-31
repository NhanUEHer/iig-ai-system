const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('node:crypto');

function encryptionKey(env = process.env) {
  const source = env.WEBHOOK_SECRET_ENCRYPTION_KEY || env.JWT_SECRET || 'local-development-webhook-key';
  if (env.NODE_ENV === 'production' && !env.WEBHOOK_SECRET_ENCRYPTION_KEY) {
    throw new Error('WEBHOOK_SECRET_ENCRYPTION_KEY is required in production.');
  }
  return createHash('sha256').update(source).digest();
}

function generateSecret() {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}

function encryptSecret(secret, env) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(env), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

function decryptSecret(material, env) {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(env), Buffer.from(material.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(material.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(material.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

module.exports = { encryptionKey, generateSecret, encryptSecret, decryptSecret };
