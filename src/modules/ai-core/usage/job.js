const daily = require('./daily');
const alerts = require('./alerts');

const HOUR_MS = 60 * 60 * 1000;
const TIME_ZONE = 'Asia/Ho_Chi_Minh';

function localDay(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function createUsageJob(options = {}) {
  const dailyUsage = options.daily || daily;
  const budgetAlerts = options.alerts || alerts;
  const now = options.now || (() => new Date());
  const env = options.env || process.env;
  const setIntervalFn = options.setIntervalFn || setInterval;
  const clearIntervalFn = options.clearIntervalFn || clearInterval;
  const logError = options.logError || (error => console.error('[AI Core] Usage job failed:', error.message));
  let timer = null;
  let running = null;

  async function run() {
    if (running) return running;
    running = (async () => {
      const current = now();
      const yesterday = new Date(current.getTime() - 24 * 60 * 60 * 1000);
      await dailyUsage.rollup(localDay(yesterday), localDay(current));
      await budgetAlerts.checkAll();
      await dailyUsage.cleanupPreviews();
    })();
    try {
      await running;
    } finally {
      running = null;
    }
  }

  function start() {
    if (env.AI_CORE_JOBS === 'off' || timer) return false;
    void run().catch(logError);
    timer = setIntervalFn(() => void run().catch(logError), HOUR_MS);
    if (typeof timer?.unref === 'function') timer.unref();
    return true;
  }

  function stop() {
    if (timer) clearIntervalFn(timer);
    timer = null;
  }

  return { start, stop, run };
}

const job = createUsageJob();

module.exports = { ...job, createUsageJob, localDay, HOUR_MS };
