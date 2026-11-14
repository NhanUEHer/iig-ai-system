const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const db = require('../src/config/db');
const { createReadinessHandler } = require('../src/http/readinessHandler');

function fakePool(query) {
  const pool = new EventEmitter();
  pool.query = query;
  return pool;
}

test('idle pool errors are sanitized and do not request exit when the probe succeeds', async () => {
  const logs = [];
  const exits = [];
  const pool = fakePool(async () => ({ rows: [{ '?column?': 1 }] }));
  const monitor = db.configurePoolResilience(pool, {
    logError: line => logs.push(line),
    requestExit: code => exits.push(code),
  });

  pool.emit('error', Object.assign(
    new Error('connection lost postgresql://admin:topsecret@db.internal/app password=topsecret'),
    { code: 'ECONNRESET' },
  ));
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(exits, []);
  assert.equal(logs.length, 1);
  assert.deepEqual(JSON.parse(logs[0]), {
    level: 'error',
    event: 'postgres_idle_client_error',
    code: 'ECONNRESET',
    message: 'connection lost [REDACTED_DATABASE_URL] password=[REDACTED]',
  });
  assert.doesNotMatch(logs[0], /topsecret|admin/);
  monitor.stop();
});

test('continuous probe failures request one exit after the fatal window', async () => {
  let now = 0;
  let tick;
  const exits = [];
  const monitor = db.createConnectivityMonitor({
    probe: async () => { throw new Error('unreachable'); },
    fatalUnreachableMs: 100,
    probeIntervalMs: 10,
    now: () => now,
    setIntervalFn: callback => {
      tick = callback;
      return { unref() {} };
    },
    clearIntervalFn: () => {},
    requestExit: code => exits.push(code),
    logError: () => {},
  });

  await monitor.handlePoolError(new Error('lost'));
  now = 100;
  tick();
  await new Promise(resolve => setImmediate(resolve));
  await monitor.runProbe();

  assert.deepEqual(exits, [1]);
  monitor.stop();
});

test('a successful query resets the fatal unreachable window', async () => {
  let now = 0;
  let tick;
  let probeWorks = false;
  const exits = [];
  const monitor = db.createConnectivityMonitor({
    probe: async () => {
      if (!probeWorks) throw new Error('unreachable');
    },
    fatalUnreachableMs: 100,
    probeIntervalMs: 10,
    now: () => now,
    setIntervalFn: callback => {
      tick = callback;
      return { unref() {} };
    },
    clearIntervalFn: () => {},
    requestExit: code => exits.push(code),
    logError: () => {},
  });

  await monitor.handlePoolError(new Error('first outage'));
  now = 80;
  probeWorks = true;
  tick();
  await new Promise(resolve => setImmediate(resolve));
  probeWorks = false;
  await monitor.handlePoolError(new Error('second outage'));
  now = 150;
  tick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(exits, []);
  now = 180;
  tick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(exits, [1]);
  monitor.stop();
});

test('/health/ready returns 503 when PostgreSQL is unavailable and 200 after recovery', async () => {
  let ready = false;
  const timeouts = [];
  const responses = [];
  const response = {
    status(statusCode) {
      responses.push({ statusCode });
      return this;
    },
    json(body) {
      responses.at(-1).body = body;
    },
  };
  const handler = createReadinessHandler({
    isReady: async timeoutMs => {
      timeouts.push(timeoutMs);
      return ready;
    },
  });

  await handler({}, response);
  ready = true;
  await handler({}, response);

  assert.deepEqual(responses, [
    { statusCode: 503, body: { status: 'unavailable' } },
    { statusCode: 200, body: { status: 'ready' } },
  ]);
  assert.deepEqual(timeouts, [2000, 2000]);
});

// Review fix (Claude): a full outage must be detected from failing queries, not only idle-client events.
test('connectivity failures from active queries open the fatal window; SQL errors do not', async () => {
  const { createConnectivityMonitor, isConnectivityError } = require('../src/config/db');
  assert.equal(isConnectivityError({ code: 'ECONNREFUSED' }), true);
  assert.equal(isConnectivityError({ code: '57P01' }), true);
  assert.equal(isConnectivityError({ code: '08006' }), true);
  assert.equal(isConnectivityError({ message: 'Connection terminated unexpectedly' }), true);
  assert.equal(isConnectivityError({ code: '23505' }), false);
  assert.equal(isConnectivityError({ code: '42P01' }), false);
  let clock = 0; const exits = []; const timers = [];
  const monitor = createConnectivityMonitor({
    probe: async () => { throw Object.assign(new Error('down'), { code: 'ECONNREFUSED' }); },
    fatalUnreachableMs: 1000, probeIntervalMs: 100, now: () => clock,
    setIntervalFn: fn => { timers.push(fn); return { unref() {} }; }, clearIntervalFn: () => {},
    requestExit: code => exits.push(code), logError: () => {},
  });
  monitor.recordQueryFailure({ code: '23505' });
  assert.equal(timers.length, 0, 'a SQL error must not start the window');
  monitor.recordQueryFailure({ code: 'ECONNREFUSED' });
  await new Promise(resolve => setImmediate(resolve));
  clock = 1500; await timers[0](); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(exits, [1]);
});
