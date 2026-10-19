const runMigrations = require('../src/database/migrate');
const db = require('../src/config/db');

async function main() {
  try {
    await runMigrations();
    const latest = await db.query('SELECT name, applied_at FROM schema_migrations ORDER BY name DESC LIMIT 1');
    console.log(`Database migrations are up to date. Latest: ${latest.rows[0]?.name || 'none'}`);
  } finally {
    await db.close();
  }
}

main().catch(error => {
  console.error('Database migration failed:', error);
  process.exitCode = 1;
});
