const db = require('../../../config/db');
const { roundUsd } = require('../pricing/cost');

const CACHE_TTL_MS = 30 * 1000;
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function vietnamParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
}

function monthWindow(nowValue = new Date()) {
  const date = asDate(nowValue);
  const parts = vietnamParts(date);
  const year = Number(parts.year);
  const monthIndex = Number(parts.month) - 1;
  const day = Number(parts.day);
  const start = new Date(Date.UTC(year, monthIndex, 1) - VIETNAM_OFFSET_MS);
  const todayStart = new Date(Date.UTC(year, monthIndex, day) - VIETNAM_OFFSET_MS);
  return {
    key: `${parts.year}-${parts.month}`,
    monthDay: `${parts.year}-${parts.month}-01`,
    todayDay: `${parts.year}-${parts.month}-${parts.day}`,
    start,
    todayStart,
    now: date,
  };
}

function createSpendStore(database = db, options = {}) {
  const cache = new Map();
  const now = options.now || (() => new Date());

  async function monthSpent(agentId) {
    const clock = asDate(now());
    const window = monthWindow(clock);
    const cached = cache.get(agentId);
    if (cached && cached.monthKey === window.key && cached.expiresAt > clock.getTime()) {
      return cached.value;
    }

    const result = await database.query(
      `SELECT
         COALESCE((
           SELECT SUM(cost_usd) FROM aic_usage_daily
            WHERE agent_id=$1 AND mode='run' AND day >= $2::date AND day < $3::date
         ), 0)
         + COALESCE((
           SELECT SUM(cost_usd) FROM aic_call_logs
            WHERE agent_id=$1 AND mode='run' AND created_at >= $4 AND created_at <= $5
         ), 0) AS spent`,
      [agentId, window.monthDay, window.todayDay, window.todayStart, window.now],
    );
    const spent = roundUsd(Number(result.rows[0]?.spent || 0));
    cache.set(agentId, {
      monthKey: window.key,
      value: spent,
      expiresAt: clock.getTime() + CACHE_TTL_MS,
    });
    return spent;
  }

  function bump(agentId, cost) {
    const clock = asDate(now());
    const window = monthWindow(clock);
    const cached = cache.get(agentId);
    if (!cached || cached.monthKey !== window.key || cached.expiresAt <= clock.getTime()) return;
    cached.value = roundUsd(cached.value + Number(cost || 0));
  }

  function clearCache(agentId) {
    if (agentId === undefined) cache.clear();
    else cache.delete(agentId);
  }

  return { monthSpent, bump, clearCache };
}

const spend = createSpendStore();

module.exports = { ...spend, createSpendStore, monthWindow, CACHE_TTL_MS, TIME_ZONE };
