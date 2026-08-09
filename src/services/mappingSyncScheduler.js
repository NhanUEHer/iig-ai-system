const repository = require('../modules/mappings/syncScheduleRepository');
const syncService = require('./syncService');

const POLL_MS = 30 * 1000;
let timer = null;
let checking = false;

function dateParts(date = new Date(), timezone = 'Asia/Ho_Chi_Minh') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function previousDate(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function check(now = new Date(), dependencies = {}) {
  if (checking) return null;
  checking = true;
  const schedules = dependencies.repository || repository;
  const sync = dependencies.syncService || syncService;
  try {
    const config = await schedules.get();
    if (!config?.enabled) return null;
    const local = dateParts(now, config.timezone);
    const runTime = String(config.run_time).slice(0, 5);
    if (local.time < runTime || String(config.last_run_date || '').slice(0, 10) === local.date) return null;
    const claimed = await schedules.claim(local.date);
    if (!claimed) return null;
    try {
      const count = await sync.syncMappings({
        pageSize: claimed.page_size,
        fromSubmittedDate: previousDate(local.date),
        toSubmittedDate: local.date
      });
      await schedules.complete({ count });
      console.log(`[MappingSyncScheduler] Synced ${count} mappings for ${local.date}.`);
      return { count, runDate: local.date };
    } catch (error) {
      await schedules.fail(error.message);
      console.error('[MappingSyncScheduler] Job failed:', error.message);
      return { error: error.message, runDate: local.date };
    }
  } finally {
    checking = false;
  }
}

function start() {
  if (timer) return timer;
  timer = setInterval(() => check().catch(error => console.error('[MappingSyncScheduler] Check failed:', error.message)), POLL_MS);
  timer.unref?.();
  check().catch(error => console.error('[MappingSyncScheduler] Initial check failed:', error.message));
  return timer;
}

function stop() { if (timer) clearInterval(timer); timer = null; }

module.exports = { start, stop, check, dateParts, previousDate };
