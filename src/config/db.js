const { Pool } = require('pg');
const runTransaction = require('../database/transaction');
require('dotenv').config();

const DEFAULT_FATAL_UNREACHABLE_MS = 120000;
const DEFAULT_PROBE_INTERVAL_MS = 5000;
const DEFAULT_PROBE_TIMEOUT_MS = 2000;

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeErrorMessage(message) {
  return String(message || 'Idle PostgreSQL client connection failed')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/\b(password|passwd|pwd)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}

// Errors that mean "cannot reach PostgreSQL" (not SQL/data errors): network codes, admin shutdown
// and SQLSTATE class 08 (connection exception) / 57P0x (operator intervention).
function isConnectivityError(error) {
  const code = String(error?.code || '');
  if (/^(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|EAI_AGAIN|EPIPE)$/.test(code)) return true;
  if (/^08/.test(code) || /^57P0[1-3]$/.test(code)) return true;
  return /Connection terminated|connection timeout|timeout exceeded when trying to connect/i.test(String(error?.message || ''));
}

function createConnectivityMonitor({
  probe,
  fatalUnreachableMs = DEFAULT_FATAL_UNREACHABLE_MS,
  probeIntervalMs = DEFAULT_PROBE_INTERVAL_MS,
  now = Date.now,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  requestExit = code => process.exit(code),
  logError = line => console.error(line),
} = {}) {
  let unreachableSince = null;
  let interval = null;
  let probeInFlight = false;
  let exitRequested = false;

  function stopInterval() {
    if (interval) clearIntervalFn(interval);
    interval = null;
  }

  function recordSuccess() {
    unreachableSince = null;
    exitRequested = false;
    stopInterval();
  }

  function requestFatalExitOnce() {
    if (exitRequested) return;
    exitRequested = true;
    requestExit(1);
  }

  async function runProbe() {
    if (probeInFlight || unreachableSince === null) return;
    probeInFlight = true;
    try {
      await probe();
      recordSuccess();
    } catch (_error) {
      if (now() - unreachableSince >= fatalUnreachableMs) requestFatalExitOnce();
    } finally {
      probeInFlight = false;
    }
  }

  function startFailureWindow() {
    if (unreachableSince === null) unreachableSince = now();
    if (!interval) {
      interval = setIntervalFn(() => void runProbe(), probeIntervalMs);
      if (typeof interval.unref === 'function') interval.unref();
    }
    return runProbe();
  }

  function handlePoolError(error) {
    const code = /^[A-Za-z0-9_-]{1,64}$/.test(String(error?.code || ''))
      ? String(error.code)
      : 'UNKNOWN';
    logError(JSON.stringify({
      level: 'error',
      event: 'postgres_idle_client_error',
      code,
      message: sanitizeErrorMessage(error?.message),
    }));
    return startFailureWindow();
  }

  // Active queries failing for connectivity reasons also open the window, so a full outage is
  // detected even when no idle client exists to emit a pool 'error' event.
  function recordQueryFailure(error) {
    if (isConnectivityError(error)) void startFailureWindow();
  }

  return { handlePoolError, recordSuccess, recordQueryFailure, runProbe, stop: stopInterval };
}

function configurePoolResilience(pool, options = {}) {
  const probeTimeoutMs = positiveNumber(options.probeTimeoutMs, DEFAULT_PROBE_TIMEOUT_MS);
  const fatalUnreachableMs = positiveNumber(options.fatalUnreachableMs, DEFAULT_FATAL_UNREACHABLE_MS);
  const rawQuery = pool.query.bind(pool);
  const monitor = createConnectivityMonitor({
    ...options,
    fatalUnreachableMs,
    probeIntervalMs: positiveNumber(
      options.probeIntervalMs,
      Math.min(DEFAULT_PROBE_INTERVAL_MS, fatalUnreachableMs),
    ),
    probe: options.probe || (() => rawQuery({ text: 'SELECT 1', query_timeout: probeTimeoutMs })),
  });

  pool.query = async (...args) => {
    try {
      const result = await rawQuery(...args);
      monitor.recordSuccess();
      return result;
    } catch (error) {
      monitor.recordQueryFailure(error);
      throw error;
    }
  };
  pool.on('error', error => void monitor.handlePoolError(error));

  return monitor;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Math.max(5, Number(process.env.DB_POOL_MAX || 30)),
  idleTimeoutMillis: Math.max(1000, Number(process.env.DB_POOL_IDLE_TIMEOUT_MS || 30000)),
  connectionTimeoutMillis: Math.max(500, Number(process.env.DB_POOL_CONNECTION_TIMEOUT_MS || 5000)),
});

pool.on('connect', () => {
  console.log('🐘 PostgreSQL connected successfully');
});

const connectivityMonitor = configurePoolResilience(pool, {
  fatalUnreachableMs: positiveNumber(process.env.DB_FATAL_UNREACHABLE_MS, DEFAULT_FATAL_UNREACHABLE_MS),
});

async function query(text, params) {
  return pool.query(text, params);
}

async function transaction(work) {
  try {
    const result = await runTransaction(pool, work);
    connectivityMonitor.recordSuccess();
    return result;
  } catch (error) {
    connectivityMonitor.recordQueryFailure(error);
    throw error;
  }
}

async function isReady(timeoutMs = DEFAULT_PROBE_TIMEOUT_MS) {
  let timeout;
  try {
    await Promise.race([
      query({ text: 'SELECT 1', query_timeout: timeoutMs }),
      new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('PostgreSQL readiness probe timed out')), timeoutMs);
        if (typeof timeout.unref === 'function') timeout.unref();
      }),
    ]);
    return true;
  } catch (_error) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  query,
  transaction,
  isReady,
  close: async () => {
    connectivityMonitor.stop();
    return pool.end();
  },
  pool,
  createConnectivityMonitor,
  configurePoolResilience,
  isConnectivityError,
};
