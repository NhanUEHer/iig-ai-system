const db = require('../../../config/db');

const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dayValue(value) {
  if (typeof value === 'string' && DAY_PATTERN.test(value)) return value;
  throw new TypeError('AI Core rollup days must use YYYY-MM-DD.');
}

function createDailyUsage(database = db) {
  async function rollup(fromDay, toDay) {
    const from = dayValue(fromDay);
    const to = dayValue(toDay);
    if (from > to) throw new RangeError('AI Core rollup fromDay must not be after toDay.');

    const work = async client => {
      await client.query(
        'DELETE FROM aic_usage_daily WHERE day BETWEEN $1::date AND $2::date',
        [from, to],
      );
      const result = await client.query(
        `INSERT INTO aic_usage_daily (
           day, agent_id, mode, calls, success, failed, blocked, truncated,
           schema_first_try_ok, fallback, input_tokens, cached_input_tokens,
           output_tokens, cost_usd, latency_p95_ms
         )
         SELECT
           (created_at AT TIME ZONE '${TIME_ZONE}')::date AS day,
           agent_id,
           mode,
           COUNT(*)::integer AS calls,
           COUNT(*) FILTER (WHERE status='success')::integer AS success,
           COUNT(*) FILTER (WHERE status='failed')::integer AS failed,
           COUNT(*) FILTER (WHERE status='blocked')::integer AS blocked,
           COUNT(*) FILTER (WHERE error_code='OUTPUT_TRUNCATED')::integer AS truncated,
           COUNT(*) FILTER (WHERE schema_valid_first_try IS TRUE)::integer AS schema_first_try_ok,
           COUNT(*) FILTER (WHERE used_fallback)::integer AS fallback,
           COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
           COALESCE(SUM(cached_input_tokens), 0)::bigint AS cached_input_tokens,
           COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
           COALESCE(SUM(cost_usd), 0)::numeric(14,8) AS cost_usd,
           ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::integer AS latency_p95_ms
         FROM aic_call_logs
         WHERE agent_id IS NOT NULL
           AND (created_at AT TIME ZONE '${TIME_ZONE}')::date BETWEEN $1::date AND $2::date
         GROUP BY 1, 2, 3
         ON CONFLICT (day, agent_id, mode) DO UPDATE SET
           calls=EXCLUDED.calls,
           success=EXCLUDED.success,
           failed=EXCLUDED.failed,
           blocked=EXCLUDED.blocked,
           truncated=EXCLUDED.truncated,
           schema_first_try_ok=EXCLUDED.schema_first_try_ok,
           fallback=EXCLUDED.fallback,
           input_tokens=EXCLUDED.input_tokens,
           cached_input_tokens=EXCLUDED.cached_input_tokens,
           output_tokens=EXCLUDED.output_tokens,
           cost_usd=EXCLUDED.cost_usd,
           latency_p95_ms=EXCLUDED.latency_p95_ms
         RETURNING *`,
        [from, to],
      );
      return result.rows;
    };

    return typeof database.transaction === 'function'
      ? database.transaction(work)
      : work(database);
  }

  async function cleanupPreviews() {
    const result = await database.query(
      `UPDATE aic_call_logs
          SET request_preview=NULL, response_preview=NULL
        WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
          AND (request_preview IS NOT NULL OR response_preview IS NOT NULL)`,
    );
    return result.rowCount || 0;
  }

  return { rollup, cleanupPreviews };
}

const daily = createDailyUsage();

module.exports = { ...daily, createDailyUsage, TIME_ZONE };
