const db = require('../../../config/db');
const HttpError = require('../../../http/httpError');
const { roundUsd } = require('../pricing/cost');

function dateKey(date) { return date.toISOString().slice(0, 10); }

function createUsageService(database = db, options = {}) {
  const now = options.now || (() => new Date());

  async function get(query = {}) {
    const range = Number(query.days || 30);
    if (![7, 30].includes(range)) throw new HttpError('days must be 7 or 30.', 400, 'AI_CORE_INVALID_RANGE');
    const current = new Date(now());
    const result = await database.query(
      `WITH selected_agents AS (
         SELECT id, monthly_budget_usd FROM aic_agents WHERE ($1::text IS NULL OR key=$1)
       ), range_days AS (
         SELECT generate_series(
           (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - ($2::int - 1),
           (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
           INTERVAL '1 day'
         )::date AS day
       ), daily AS (
         SELECT (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
                COALESCE(SUM(l.cost_usd),0) AS cost, COUNT(*)::int AS calls,
                COALESCE(SUM(l.input_tokens),0)::bigint AS input_tokens,
                COALESCE(SUM(l.cached_input_tokens),0)::bigint AS cached_input_tokens,
                COALESCE(SUM(l.output_tokens),0)::bigint AS output_tokens,
                COALESCE(SUM(l.thinking_tokens),0)::bigint AS thinking_tokens
           FROM aic_call_logs l JOIN selected_agents a ON a.id=l.agent_id
          WHERE l.mode='run' AND l.created_at >= CURRENT_TIMESTAMP - ($2::text || ' days')::interval
          GROUP BY 1
       )
       SELECT d.day::text AS day, COALESCE(x.cost,0) AS cost, COALESCE(x.calls,0) AS calls,
              COALESCE(x.input_tokens,0) AS input_tokens,
              COALESCE(x.cached_input_tokens,0) AS cached_input_tokens,
              COALESCE(x.output_tokens,0) AS output_tokens,
              COALESCE(x.thinking_tokens,0) AS thinking_tokens
         FROM range_days d LEFT JOIN daily x USING(day) ORDER BY d.day`,
      [query.agentKey || null, range],
    );
    const summary = await database.query(
      `SELECT COALESCE(SUM(l.cost_usd),0) AS spent,
              COALESCE((SELECT SUM(monthly_budget_usd) FROM aic_agents WHERE ($1::text IS NULL OR key=$1)),0) AS budget_total
         FROM aic_call_logs l JOIN aic_agents a ON a.id=l.agent_id
        WHERE l.mode='run' AND ($1::text IS NULL OR a.key=$1)
          AND l.created_at >= (date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
      [query.agentKey || null],
    );
    const spent = Number(summary.rows[0]?.spent || 0);
    const budgetTotal = Number(summary.rows[0]?.budget_total || 0);
    const dayOfMonth = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ho_Chi_Minh', day: 'numeric' }).format(current));
    const monthParts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: 'numeric' }).formatToParts(current);
    const year = Number(monthParts.find(part => part.type === 'year').value);
    const month = Number(monthParts.find(part => part.type === 'month').value);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const days = result.rows.map(row => ({ day: typeof row.day === 'string' ? row.day.slice(0, 10) : dateKey(new Date(row.day)), cost: Number(row.cost), calls: Number(row.calls) }));
    const tokens = result.rows.reduce((total, row) => ({
      input: total.input + Number(row.input_tokens), cachedInput: total.cachedInput + Number(row.cached_input_tokens),
      output: total.output + Number(row.output_tokens), thinking: total.thinking + Number(row.thinking_tokens),
    }), { input: 0, cachedInput: 0, output: 0, thinking: 0 });
    return { month: { spent: roundUsd(spent), budgetTotal, forecast: roundUsd((spent / Math.max(1, dayOfMonth)) * daysInMonth) }, days, tokens };
  }

  return { get };
}

const service = createUsageService();
module.exports = { ...service, createUsageService };
