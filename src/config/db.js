const { Pool } = require('pg');
const runTransaction = require('../database/transaction');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Math.max(5, Number(process.env.DB_POOL_MAX || 30)),
  idleTimeoutMillis: Math.max(1000, Number(process.env.DB_POOL_IDLE_TIMEOUT_MS || 30000)),
  connectionTimeoutMillis: Math.max(500, Number(process.env.DB_POOL_CONNECTION_TIMEOUT_MS || 5000)),
});

pool.on('connect', () => {
  console.log('🐘 PostgreSQL connected successfully');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  transaction: work => runTransaction(pool, work),
  close: () => pool.end(),
  pool,
};
