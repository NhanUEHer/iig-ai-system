const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');

const { apiAccessLogger, buildApiAccessLog, cleanHeaderValue, routeTemplate } = require('../src/http/apiAccessLogger');
const requestContext = require('../src/http/requestContext');

test('access log has trace fields and excludes query values and secret headers', () => {
  const req = {
    requestId: 'trace-123',
    method: 'GET',
    path: '/api/exams',
    query: { access_token: 'must-not-appear', page: '1' },
    auth: { userId: 'user-1', sessionId: 'session-1', role: 'admin' },
    socket: { remoteAddress: '127.0.0.1' },
    get(name) {
      return {
        authorization: 'Bearer must-not-appear',
        cookie: 'session=must-not-appear',
        'content-type': 'application/json',
        'user-agent': 'test-agent',
        'x-forwarded-for': '203.0.113.10, 127.0.0.1'
      }[name];
    }
  };
  const res = {
    statusCode: 200,
    locals: {},
    getHeader: () => '42'
  };

  const entry = buildApiAccessLog(req, res, 12.34);
  assert.equal(entry.requestId, 'trace-123');
  assert.equal(entry.path, '/api/exams');
  assert.equal(routeTemplate('/api/public/exams/11111111-1111-4111-8111-111111111111/attempts/42'), '/api/public/exams/:id/attempts/:number');
  assert.deepEqual(entry.queryKeys, ['access_token', 'page']);
  assert.equal(entry.clientIp, '203.0.113.10');
  assert.equal(entry.responseBytes, 42);
  assert.equal(entry.userId, 'user-1');
  assert.equal(entry.requestHeaders.authorization, undefined);
  assert.equal(entry.requestHeaders.cookie, undefined);
  assert.doesNotMatch(JSON.stringify(entry), /must-not-appear/);
});

test('access log records cache and answer storage outcomes without payload data', () => {
  const req = { requestId: 'trace-789', method: 'PUT', path: '/api/public/exams/11111111-1111-4111-8111-111111111111/attempts/22222222-2222-4222-8222-222222222222/answers/33333333-3333-4333-8333-333333333333', query: {}, socket: {}, get: () => undefined };
  const res = { statusCode: 200, locals: { cacheStatus: 'PUBLISHED_HIT', answerStorage: 'REDIS' }, getHeader: () => undefined };
  const entry = buildApiAccessLog(req, res, 5.25);
  assert.equal(entry.routeTemplate, '/api/public/exams/:id/attempts/:id/answers/:id');
  assert.equal(entry.cacheStatus, 'PUBLISHED_HIT');
  assert.equal(entry.answerStorage, 'REDIS');
});

test('access middleware logs API responses once and ignores non-API paths', () => {
  const originalLog = console.log;
  const lines = [];
  console.log = line => lines.push(JSON.parse(line));
  try {
    const apiResponse = Object.assign(new EventEmitter(), {
      statusCode: 204,
      locals: {},
      writableEnded: true,
      getHeader: () => undefined
    });
    const apiRequest = {
      requestId: 'trace-456', method: 'POST', path: '/api/test', query: {}, socket: {}, get: () => undefined
    };
    apiAccessLogger(apiRequest, apiResponse, () => {});
    apiResponse.emit('finish');
    apiResponse.emit('close');

    const healthResponse = new EventEmitter();
    apiAccessLogger({ path: '/health' }, healthResponse, () => {});

    assert.equal(lines.length, 1);
    assert.equal(lines[0].event, 'api_request_completed');
    assert.equal(lines[0].requestId, 'trace-456');
  } finally {
    console.log = originalLog;
  }
});

test('request context rejects unsafe request ids and strips control characters', () => {
  const req = { get: () => 'bad request id\nforged' };
  const headers = {};
  requestContext(req, { setHeader: (name, value) => { headers[name] = value; } }, () => {});
  assert.match(req.requestId, /^[0-9a-f-]{36}$/);
  assert.equal(headers['x-request-id'], req.requestId);
  assert.equal(cleanHeaderValue('safe\nforged'), 'safeforged');
});
