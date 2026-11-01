require('dotenv').config({ path: ['.env.r2.local', '.env'] });
const createAiScoringApp = require('./app');
const initDb = require('../../config/initDb');
const db = require('../../config/db');
const redis = require('../../config/redis');
const { runtimePort, listen, installShutdown, closeServer } = require('../shared/httpRuntime');
const { createReadiness } = require('../shared/readiness');
const { runtimeLog } = require('../shared/runtimeLog');

async function startAiScoringApi(dependencies = {}) {
  const deps = {
    initDb: dependencies.initDb || initDb,
    db: dependencies.db || db,
    redis: dependencies.redis || redis,
    processRef: dependencies.processRef || process,
    listen: dependencies.listen || listen,
  };
  const readiness = dependencies.readiness || createReadiness({ db: deps.db, redis: deps.redis });
  deps.app = dependencies.app || createAiScoringApp({ readiness });
  const port = dependencies.port || runtimePort('AI_SCORING_API_PORT', deps.processRef.env);

  await deps.initDb();
  const server = await deps.listen(deps.app, port, 'ai-scoring-api');
  const close = async () => {
    await closeServer(server);
    await deps.redis.close();
    await deps.db.close();
  };
  if (dependencies.installSignals !== false) {
    installShutdown({ serviceName: 'ai-scoring-api', close, processRef: deps.processRef });
  }
  return { app: deps.app, server, close };
}

if (require.main === module) startAiScoringApi().catch(error => {
  runtimeLog('ai-scoring-api', 'runtime_start_failed', {
    error: error.message,
    stack: error.stack,
  }, 'error');
  process.exit(1);
});

module.exports = startAiScoringApi;
