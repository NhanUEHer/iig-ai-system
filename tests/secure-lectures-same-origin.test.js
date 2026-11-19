const test = require('node:test');
const assert = require('node:assert/strict');
const { sameOriginOnly } = require('../src/http/sameOriginOnly');

function run(headers, { host = 'localhost:5105', protocol = 'http' } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const req = { protocol, get: name => (name.toLowerCase() === 'host' ? host : lower[name.toLowerCase()]) };
  let result;
  sameOriginOnly(req, {}, error => { result = error || 'ok'; });
  return result === 'ok' ? 'ok' : result.code;
}

test('browser same-origin request passes even when a proxy rewrote Host', () => {
  assert.equal(run({ origin: 'http://localhost:5199', 'sec-fetch-site': 'same-origin' }), 'ok');
});

test('cross-site browser request is rejected', () => {
  assert.equal(run({ origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }), 'CORS_FORBIDDEN');
});

test('without Sec-Fetch-Site, forwarded host or matching host is accepted, others rejected', () => {
  assert.equal(run({ origin: 'http://localhost:5105' }), 'ok');
  assert.equal(run({ origin: 'https://admin.iig.test', 'x-forwarded-host': 'admin.iig.test', 'x-forwarded-proto': 'https' }), 'ok');
  assert.equal(run({ origin: 'https://evil.example' }), 'CORS_FORBIDDEN');
});

test('requests without Origin (server-to-server, sendBeacon same-origin) pass', () => {
  assert.equal(run({}), 'ok');
});
