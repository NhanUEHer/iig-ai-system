const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const migrationsDir = path.join(__dirname, 'migrations');

async function runMigrations() {
  const migrationClient = await db.pool.connect();
  try {
    // Only one application instance may inspect/apply migrations at a time.
    // The session-level lock is released automatically if the process exits.
    await migrationClient.query("SELECT pg_advisory_lock(hashtext('ai-scoring-schema-migrations'))");
  // Historical migrations use gen_random_uuid() and digest(). Ensure their
  // PostgreSQL extension is available before replaying the migration chain on
  // a fresh database or during disaster recovery.
  await migrationClient.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  await migrationClient.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const applied = await migrationClient.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [file]
    );
    if (applied.rows.length > 0) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      await migrationClient.query('BEGIN');
      await migrationClient.query(sql);
      await migrationClient.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await migrationClient.query('COMMIT');
      console.log(`✅ Applied database migration: ${file}`);
    } catch (error) {
      await migrationClient.query('ROLLBACK');
      throw error;
    }
  }
  } finally {
    await migrationClient.query("SELECT pg_advisory_unlock(hashtext('ai-scoring-schema-migrations'))").catch(() => {});
    migrationClient.release();
  }
}

module.exports = runMigrations;
