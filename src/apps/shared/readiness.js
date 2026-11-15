function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} readiness timed out.`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function createReadiness({ db, redis, extraChecks = {}, timeoutMs = 2000 }) {
  return async function readiness() {
    const checks = {};
    try {
      await withTimeout(db.query('SELECT 1'), timeoutMs, 'database');
      checks.database = { status: 'ok' };
    } catch (error) {
      checks.database = { status: 'error', message: error.message };
    }

    if (redis?.configured?.()) {
      try {
        const client = await withTimeout(redis.connection(), timeoutMs, 'redis');
        if (!client) throw new Error('Redis is configured but unavailable.');
        await withTimeout(client.ping(), timeoutMs, 'redis');
        checks.redis = { status: 'ok' };
      } catch (error) {
        checks.redis = { status: 'error', message: error.message };
      }
    } else {
      checks.redis = { status: 'not_configured' };
    }

    for (const [name, check] of Object.entries(extraChecks)) {
      try {
        const result = await check();
        checks[name] = result === false ? { status: 'error' } : { status: 'ok' };
      } catch (error) {
        checks[name] = { status: 'error', message: error.message };
      }
    }

    return {
      ready: Object.values(checks).every(check => check.status !== 'error'),
      checks,
    };
  };
}

module.exports = { createReadiness, withTimeout };
