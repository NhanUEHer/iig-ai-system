const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createWorkerRegistry } = require('../src/apps/ai-scoring/workerRegistry');
const { createReadiness } = require('../src/apps/shared/readiness');
const startAdminServer = require('../src/apps/admin/server');
const startAiScoringApi = require('../src/apps/ai-scoring/server');
const startAiScoringWorker = require('../src/apps/ai-scoring/worker');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('admin and scoring entrypoints expose disjoint route ownership', () => {
  const admin = read('src/apps/admin/app.js');
  const scoring = read('src/apps/ai-scoring/app.js');

  assert.match(admin, /questionBankV3Routes/);
  assert.match(admin, /learningMaterialRoutes/);
  assert.doesNotMatch(admin, /iigIntegrationRoutes/);
  assert.doesNotMatch(admin, /aiScoringJobRoutes/);

  assert.match(scoring, /iigIntegrationRoutes/);
  assert.match(scoring, /aiScoringJobRoutes/);
  assert.doesNotMatch(scoring, /questionBankV3Routes/);
  assert.doesNotMatch(scoring, /learningMaterialRoutes/);
});

test('scoring API entrypoint never starts workers', () => {
  const server = read('src/apps/ai-scoring/server.js');
  assert.doesNotMatch(server, /startWorker/);
  assert.doesNotMatch(server, /createWorkerRegistry/);
});

test('admin entrypoint starts only admin-owned background services', () => {
  const server = read('src/apps/admin/server.js');
  assert.match(server, /mappingSyncScheduler/);
  assert.match(server, /dictionaryService/);
  assert.doesNotMatch(server, /iig-ingestion/);
  assert.doesNotMatch(server, /iig-ai-scoring/);
});

test('worker registry starts in order and stops in reverse order', async () => {
  const calls = [];
  const worker = name => ({
    startWorker: async () => calls.push(`start:${name}`),
    stopWorker: () => calls.push(`stop:${name}`),
  });
  const registry = createWorkerRegistry([
    ['one', worker('one')],
    ['two', worker('two')],
    ['three', worker('three')],
  ]);

  await registry.start();
  assert.equal(registry.isReady(), true);
  registry.stop();
  assert.equal(registry.isReady(), false);
  assert.deepEqual(calls, [
    'start:one', 'start:two', 'start:three',
    'stop:three', 'stop:two', 'stop:one',
  ]);
});

test('worker registry unwinds already-started workers when startup fails', async () => {
  const calls = [];
  const registry = createWorkerRegistry([
    ['one', { startWorker: async () => calls.push('start:one'), stopWorker: () => calls.push('stop:one') }],
    ['two', { startWorker: async () => { throw new Error('boom'); }, stopWorker: () => calls.push('stop:two') }],
  ]);

  await assert.rejects(registry.start(), /boom/);
  assert.deepEqual(calls, ['start:one', 'stop:one']);
});

test('legacy production entrypoints remain untouched by the split', () => {
  assert.equal(fs.existsSync(path.join(root, 'src/app.js')), true);
  assert.equal(fs.existsSync(path.join(root, 'src/server.js')), true);
});

test('readiness reports database and optional Redis dependencies', async () => {
  const readiness = createReadiness({
    db: { query: async () => ({ rows: [{ value: 1 }] }) },
    redis: { configured: () => false },
  });

  assert.deepEqual(await readiness(), {
    ready: true,
    checks: {
      database: { status: 'ok' },
      redis: { status: 'not_configured' },
    },
  });
});

test('readiness fails closed when a required dependency is unavailable', async () => {
  const readiness = createReadiness({
    db: { query: async () => { throw new Error('database unavailable'); } },
    redis: { configured: () => false },
  });
  const result = await readiness();
  assert.equal(result.ready, false);
  assert.equal(result.checks.database.status, 'error');
});

test('runtime Dockerfile exposes independent backend targets', () => {
  const dockerfile = read('Dockerfile');
  assert.match(dockerfile, /AS admin-api/);
  assert.match(dockerfile, /AS ai-scoring-api/);
  assert.match(dockerfile, /AS ai-scoring-worker/);
  assert.match(dockerfile, /src\/apps\/admin\/server\.js/);
  assert.match(dockerfile, /src\/apps\/ai-scoring\/server\.js/);
  assert.match(dockerfile, /src\/apps\/ai-scoring\/worker\.js/);
});

function closableServer(calls, name) {
  return {
    close(callback) {
      calls.push(`close:${name}`);
      callback();
    },
  };
}

function sharedRuntimeDependencies(calls) {
  return {
    initDb: async () => calls.push('init:db'),
    db: {
      query: async () => ({ rows: [{ value: 1 }] }),
      close: async () => calls.push('close:db'),
    },
    redis: {
      configured: () => false,
      close: async () => calls.push('close:redis'),
    },
    processRef: { env: {} },
    installSignals: false,
    port: 5001,
  };
}

test('admin runtime closes every owned resource when background startup fails', async () => {
  const calls = [];
  const dependencies = sharedRuntimeDependencies(calls);
  dependencies.app = {};
  dependencies.storage = { requireProductionR2: () => calls.push('check:storage') };
  dependencies.scheduler = {
    start: () => calls.push('start:scheduler'),
    stop: () => calls.push('stop:scheduler'),
  };
  dependencies.dictionary = {
    startWorker: async () => { throw new Error('dictionary startup failed'); },
    stopWorker: () => calls.push('stop:dictionary'),
  };
  dependencies.listen = async () => closableServer(calls, 'admin-http');

  await assert.rejects(startAdminServer(dependencies), /dictionary startup failed/);
  assert.deepEqual(calls, [
    'check:storage', 'init:db', 'start:scheduler', 'stop:scheduler',
    'stop:dictionary', 'close:admin-http', 'close:redis', 'close:db',
  ]);
});

test('scoring API releases database dependencies when HTTP startup fails', async () => {
  const calls = [];
  const dependencies = sharedRuntimeDependencies(calls);
  dependencies.app = {};
  dependencies.listen = async () => { throw new Error('port unavailable'); };

  await assert.rejects(startAiScoringApi(dependencies), /port unavailable/);
  assert.deepEqual(calls, ['init:db', 'close:redis', 'close:db']);
});

test('scoring worker unwinds workers and dependencies when health server startup fails', async () => {
  const calls = [];
  const dependencies = sharedRuntimeDependencies(calls);
  dependencies.app = {};
  dependencies.storage = { requireProductionR2: () => calls.push('check:storage') };
  dependencies.registry = {
    names: ['ingestion', 'scoring'],
    isReady: () => true,
    start: async () => calls.push('start:workers'),
    stop: () => calls.push('stop:workers'),
  };
  dependencies.listen = async () => { throw new Error('health port unavailable'); };

  await assert.rejects(startAiScoringWorker(dependencies), /health port unavailable/);
  assert.deepEqual(calls, [
    'check:storage', 'init:db', 'start:workers', 'stop:workers',
    'close:redis', 'close:db',
  ]);
});
