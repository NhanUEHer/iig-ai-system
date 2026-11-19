const { AiCoreError } = require('../errors');

const WAIT_TIMEOUT_MS = 30 * 1000;
const DEFAULT_PROVIDER_CONCURRENCY = 8;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createLimiter(options = {}) {
  const semaphores = new Map();
  const setTimeoutFn = options.setTimeoutFn || setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
  const waitTimeoutMs = positiveInteger(options.waitTimeoutMs, WAIT_TIMEOUT_MS);
  const env = options.env || process.env;

  function semaphore(key, limit) {
    let current = semaphores.get(key);
    if (!current) {
      current = { active: 0, limit, queue: [] };
      semaphores.set(key, current);
    } else {
      current.limit = limit;
    }
    return current;
  }

  function drain(entry) {
    while (entry.active < entry.limit && entry.queue.length) {
      const waiter = entry.queue.shift();
      if (waiter.done) continue;
      waiter.done = true;
      clearTimeoutFn(waiter.timeout);
      entry.active += 1;
      waiter.resolve();
    }
  }

  function acquire(key, limit) {
    const entry = semaphore(key, limit);
    if (entry.active < entry.limit) {
      entry.active += 1;
      return Promise.resolve(() => {
        entry.active -= 1;
        drain(entry);
      });
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        done: false,
        resolve: () => resolve(() => {
          entry.active -= 1;
          drain(entry);
        }),
      };
      waiter.timeout = setTimeoutFn(() => {
        if (waiter.done) return;
        waiter.done = true;
        const index = entry.queue.indexOf(waiter);
        if (index >= 0) entry.queue.splice(index, 1);
        reject(new AiCoreError('TIMEOUT', 'Timed out waiting for an AI Core concurrency slot.'));
      }, waitTimeoutMs);
      if (typeof waiter.timeout?.unref === 'function') waiter.timeout.unref();
      entry.queue.push(waiter);
    });
  }

  async function limiter(state, next) {
    const agentLimit = positiveInteger(state.agent.maxConcurrency, 1);
    const providerLimit = positiveInteger(
      env.AI_CORE_PROVIDER_CONCURRENCY,
      DEFAULT_PROVIDER_CONCURRENCY,
    );
    const releaseAgent = await acquire(`agent:${state.agent.id || state.key}`, agentLimit);
    let releaseProvider;
    try {
      releaseProvider = await acquire(
        `connection:${state.connection.id || state.connection.provider}`,
        providerLimit,
      );
      return await next();
    } finally {
      if (releaseProvider) releaseProvider();
      releaseAgent();
    }
  }

  limiter._semaphores = semaphores;
  return limiter;
}

const limiter = createLimiter();

module.exports = limiter;
module.exports.limiter = limiter;
module.exports.createLimiter = createLimiter;
module.exports.WAIT_TIMEOUT_MS = WAIT_TIMEOUT_MS;
module.exports.DEFAULT_PROVIDER_CONCURRENCY = DEFAULT_PROVIDER_CONCURRENCY;
