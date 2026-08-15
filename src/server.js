// Keep rotated/local secrets outside the shared .env. Values loaded first win.
require('dotenv').config({ path: ['.env.r2.local', '.env'] });
const app = require('./app');
const initDb = require('./config/initDb');
const db = require('./config/db');
const { validateEnv } = require('./config/env');
const { getBuildInfo } = require('./config/buildInfo');
const mappingSyncScheduler = require('./services/mappingSyncScheduler');

async function startServer() {
  let server;
  try {
    const { port } = validateEnv();
    // 1. Initialize Postgres tables
    await initDb();
    
    // 2. Start Express app listening
    server = app.listen(port, () => {
      const build = getBuildInfo();
      console.log(`🚀 AI Scoring Admin ${build.label} v${build.version} running on http://localhost:${port}`);
    });
    mappingSyncScheduler.start();

    const shutdown = signal => {
      console.log(`${signal} received; shutting down gracefully.`);
      server.close(async () => {
        mappingSyncScheduler.stop();
        await db.close();
        process.exit(0);
      });
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Failed to start server due to DB initialization error:', error);
    process.exit(1);
  }
}

if (require.main === module) startServer();

module.exports = startServer;
