require('dotenv').config({ path: ['.env.r2.local', '.env'] });
const initDb = require('../../config/initDb');
const db = require('../../config/db');
const redis = require('../../config/redis');
const storageService = require('../../services/storageService');
const { createWorkerRegistry } = require('./workerRegistry');
const createHttpApp = require('../shared/createHttpApp');
const { createReadiness } = require('../shared/readiness');
const { runtimePort, listen, installShutdown, closeServer } = require('../shared/httpRuntime');
const { runtimeLog } = require('../shared/runtimeLog');

async function startAiScoringWorker(dependencies = {}) {
  const deps = {
    initDb: dependencies.initDb || initDb,
    db: dependencies.db || db,
    redis: dependencies.redis || redis,
    storage: dependencies.storage || storageService,
    registry: dependencies.registry || createWorkerRegistry(),
    processRef: dependencies.processRef || process,
    listen: dependencies.listen || listen,
  };
  const readiness = dependencies.readiness || createReadiness({
    db: deps.db,
    redis: deps.redis,
    extraChecks: {
      workers: async () => deps.registry.isReady(),
    },
  });
  const app = dependencies.app || createHttpApp({
    serviceName: 'ai-scoring-worker',
    readiness,
    mountRoutes() {},
  });
  const port = dependencies.port || runtimePort('AI_SCORING_WORKER_HEALTH_PORT', deps.processRef.env);

  deps.storage.requireProductionR2();
  await deps.initDb();
  let healthServer;
  try {
    await deps.registry.start();
    healthServer = await deps.listen(app, port, 'ai-scoring-worker');
  } catch (error) {
    deps.registry.stop();
    await closeServer(healthServer);
    await Promise.allSettled([deps.redis.close(), deps.db.close()]);
    throw error;
  }

  const close = async () => {
    await closeServer(healthServer);
    deps.registry.stop();
    await deps.redis.close();
    await deps.db.close();
  };
  if (dependencies.installSignals !== false) {
    installShutdown({ serviceName: 'ai-scoring-worker', close, processRef: deps.processRef });
  }
  return { app, healthServer, close, workers: deps.registry.names };
}

if (require.main === module) startAiScoringWorker().catch(error => {
  runtimeLog('ai-scoring-worker', 'runtime_start_failed', {
    error: error.message,
    stack: error.stack,
  }, 'error');
  process.exit(1);
});

module.exports = startAiScoringWorker;
