const MAX_RETRY_AFTER_MS = 10 * 1000;
const BACKOFF_MS = [1000, 2000, 4000];

function defaultSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryAfterMs(error, now = Date.now) {
  const explicitMs = Number(error?.retryAfterMs);
  if (Number.isFinite(explicitMs) && explicitMs >= 0) return explicitMs;
  const header = error?.retryAfter
    ?? error?.response?.headers?.['retry-after']
    ?? error?.response?.headers?.get?.('retry-after');
  if (header === undefined || header === null || header === '') return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(header);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - now());
}

function createRetry(options = {}) {
  const sleep = options.sleep || defaultSleep;
  const random = options.random || Math.random;
  const now = options.now || Date.now;

  return async function retry(state, next) {
    const maxRetries = Math.max(0, Math.min(5, Number(state.version.maxRetries) || 0));
    for (let retryNumber = 0; ; retryNumber += 1) {
      try {
        return await next();
      } catch (error) {
        if (!error?.retryable || retryNumber >= maxRetries) throw error;
        const requested = retryAfterMs(error, now);
        const delay = requested === null
          ? BACKOFF_MS[Math.min(retryNumber, BACKOFF_MS.length - 1)] * (0.8 + random() * 0.4)
          : requested;
        await sleep(Math.min(MAX_RETRY_AFTER_MS, Math.max(0, Math.round(delay))));
      }
    }
  };
}

const retry = createRetry();

module.exports = retry;
module.exports.retry = retry;
module.exports.createRetry = createRetry;
module.exports.retryAfterMs = retryAfterMs;
module.exports.MAX_RETRY_AFTER_MS = MAX_RETRY_AFTER_MS;
