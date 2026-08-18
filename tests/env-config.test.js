const assert = require('node:assert/strict');
const test = require('node:test');

const { validateEnv } = require('../src/config/env');
const { getBuildInfo } = require('../src/config/buildInfo');

test('environment validation requires a database URL', () => {
  assert.throws(() => validateEnv({ PORT: '5000' }), /DATABASE_URL/);
});

test('environment validation normalizes a valid port', () => {
  assert.deepEqual(validateEnv({ DATABASE_URL: 'postgres://db', PORT: '8080' }), { port: 8080 });
  assert.throws(() => validateEnv({ DATABASE_URL: 'postgres://db', PORT: '70000' }), /PORT/);
});

test('environment validation accepts only known application environments', () => {
  assert.deepEqual(validateEnv({ DATABASE_URL: 'postgres://db', APP_ENV: 'development' }), { port: 5000 });
  assert.throws(() => validateEnv({ DATABASE_URL: 'postgres://db', APP_ENV: 'staging' }), /APP_ENV/);
});

test('production requires HTTPS and a secure JWT secret without email configuration', () => {
  const valid = {
    DATABASE_URL: 'postgres://db', NODE_ENV: 'production', APP_ENV: 'production',
    APP_URL: 'https://admin.iigvn.site', JWT_SECRET: 'a'.repeat(32)
  };
  assert.deepEqual(validateEnv(valid), { port: 5000 });
  assert.throws(() => validateEnv({ ...valid, APP_URL: 'http://admin.iigvn.site' }), /HTTPS/);
});

test('build info distinguishes Dev and Production and exposes version', () => {
  assert.deepEqual(getBuildInfo({ NODE_ENV: 'development', APP_VERSION: '1.2.3' }), {
    environment: 'development', label: 'Dev', version: '1.2.3', commit: null
  });
  assert.deepEqual(getBuildInfo({ NODE_ENV: 'production', APP_ENV: 'production', APP_VERSION: '2.0.0', APP_COMMIT: 'abc123' }), {
    environment: 'production', label: 'Production', version: '2.0.0', commit: 'abc123'
  });
});
