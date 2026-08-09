const assert = require('node:assert/strict');
const test = require('node:test');

const app = require('../src/app');

async function withServer(t, run) {
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
  } catch (error) {
    if (error.code === 'EPERM') {
      t.skip('Runtime sandbox does not permit loopback sockets.');
      return;
    }
    throw error;
  }
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('HTTP health endpoint returns and propagates a request id', async t => {
  await withServer(t, async origin => {
    const response = await fetch(`${origin}/health`, { headers: { 'x-request-id': 'test-request-id' } });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-request-id'), 'test-request-id');
    assert.equal(body.requestId, 'test-request-id');
  });
});

test('HTTP protected routes require an access token', async t => {
  await withServer(t, async origin => {
    const response = await fetch(`${origin}/api/submissions/grade-ai`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.success, false);
    assert.equal(body.code, 'AUTH_REQUIRED');
    assert.equal(typeof body.requestId, 'string');
  });
});

test('HTTP unknown routes return a structured 404', async t => {
  await withServer(t, async origin => {
    const response = await fetch(`${origin}/does-not-exist`);
    const body = await response.json();
    assert.equal(response.status, 404);
    assert.equal(body.code, 'ROUTE_NOT_FOUND');
  });
});
