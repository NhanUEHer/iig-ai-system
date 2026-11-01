require('dotenv').config({ path: ['.env.r2.local', '.env'] });
const createAdminApp = require('./app');
const initDb = require('../../config/initDb');
const db = require('../../config/db');
const redis = require('../../config/redis');
const storageService = require('../../services/storageService');
const mappingSyncScheduler = require('../../services/mappingSyncScheduler');
const dictionaryService = require('../../modules/dictionary/dictionaryService');
const { runtimePort, listen, installShutdown, closeServer } = require('../shared/httpRuntime');
const { createReadiness } = require('../shared/readiness');
const { runtimeLog } = require('../shared/runtimeLog');

async function startAdminServer(dependencies = {}) {
  const deps = {
    initDb: dependencies.initDb || initDb,
    db: dependencies.db || db,
    redis: dependencies.redis || redis,
    storage: dependencies.storage || storageService,
    scheduler: dependencies.scheduler || mappingSyncScheduler,
    dictionary: dependencies.dictionary || dictionaryService,
    processRef: dependencies.processRef || process,
    listen: dependencies.listen || listen,
  };
  const readiness = dependencies.readiness || createReadiness({ db: deps.db, redis: deps.redis });
  deps.app = dependencies.app || createAdminApp({ readiness });
  const port = dependencies.port || runtimePort('ADMIN_API_PORT', deps.processRef.env);

  deps.storage.requireProductionR2();
  await deps.initDb();
  const server = await deps.listen(deps.app, port, 'iig-admin-api');
  try {
    deps.scheduler.start();
    await deps.dictionary.startWorker();
  } catch (error) {
    deps.scheduler.stop();
    deps.dictionary.stopWorker();
    await closeServer(server);
    throw error;
  }

  const close = async () => {
    deps.scheduler.stop();
    deps.dictionary.stopWorker();
    await closeServer(server);
    await deps.redis.close();
    await deps.db.close();
  };
  if (dependencies.installSignals !== false) {
    installShutdown({ serviceName: 'iig-admin-api', close, processRef: deps.processRef });
  }
  return { app: deps.app, server, close };
}

if (require.main === module) startAdminServer().catch(error => {
  runtimeLog('iig-admin-api', 'runtime_start_failed', {
    error: error.message,
    stack: error.stack,
  }, 'error');
  process.exit(1);
});

module.exports = startAdminServer;
