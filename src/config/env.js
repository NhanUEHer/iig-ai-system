const REQUIRED = ['DATABASE_URL'];

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateEnv(env = process.env) {
  const missing = REQUIRED.filter(name => !env[name]?.trim());
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const port = Number.parseInt(env.PORT || '5000', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  if (env.NODE_ENV === 'production' && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
    throw new Error('JWT_SECRET must contain at least 32 characters in production.');
  }
  if (env.NODE_ENV === 'production' && (!env.APP_URL || !isHttpUrl(env.APP_URL))) {
    throw new Error('APP_URL must be a valid public HTTP(S) URL in production.');
  }
  if (env.NODE_ENV === 'production' && env.APP_URL && !env.APP_URL.startsWith('https://')) {
    throw new Error('APP_URL must use HTTPS in production.');
  }
  if (env.NODE_ENV === 'production') {
    const smtpRequired = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'];
    const missingSmtp = smtpRequired.filter(name => !env[name]?.trim());
    if (missingSmtp.length) {
      throw new Error(`Missing production email variables: ${missingSmtp.join(', ')}`);
    }
  }
  if (env.APP_ENV && !['development', 'production'].includes(env.APP_ENV)) {
    throw new Error('APP_ENV must be development or production.');
  }
  return { port };
}

module.exports = { validateEnv, isHttpUrl };
