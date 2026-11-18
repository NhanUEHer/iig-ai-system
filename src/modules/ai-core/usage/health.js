const db = require('../../../config/db');
const { roundUsd } = require('../pricing/cost');

const HEALTH_SQL = `SELECT
  a.id AS agent_id,
  a.key AS agent_key,
  a.max_cost_per_call_usd,
  a.monthly_budget_usd,
  COUNT(l.id)::integer AS calls,
  COALESCE(AVG(l.cost_usd), 0) AS average_cost_usd,
  COUNT(*) FILTER (WHERE l.error_code='OUTPUT_TRUNCATED')::integer AS truncated,
  COUNT(*) FILTER (WHERE l.schema_valid_first_try IS NOT NULL)::integer AS schema_evaluated,
  COUNT(*) FILTER (WHERE l.schema_valid_first_try IS TRUE)::integer AS schema_first_try_ok,
  COUNT(*) FILTER (WHERE l.status='blocked')::integer AS blocked,
  COUNT(*) FILTER (WHERE l.error_code IN ('PROVIDER_DOWN','AUTH_FAILED','TIMEOUT'))::integer AS provider_errors,
  COALESCE(month_usage.spent, 0) AS month_spent,
  EXTRACT(DAY FROM CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer AS elapsed_days,
  EXTRACT(DAY FROM (
    date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')
    + INTERVAL '1 month - 1 day'
  ))::integer AS days_in_month
FROM aic_agents a
LEFT JOIN aic_call_logs l
  ON l.agent_id=a.id
 AND l.mode='run'
 AND l.created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(cost_usd), 0) AS spent
  FROM aic_call_logs monthly
  WHERE monthly.agent_id=a.id
    AND monthly.mode='run'
    AND monthly.created_at >= (
      date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')
      AT TIME ZONE 'Asia/Ho_Chi_Minh'
    )
) month_usage ON TRUE
WHERE ($1::uuid IS NULL OR a.id=$1)
GROUP BY a.id, a.key, a.max_cost_per_call_usd, a.monthly_budget_usd,
         month_usage.spent`;

function number(row, key) {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : 0;
}

function percent(numerator, denominator, emptyValue = 0) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : emptyValue;
}

function formatPercent(value) {
  return Number(value.toFixed(1)).toString();
}

function healthFromRow(row) {
  const calls = number(row, 'calls');
  const ceiling = number(row, 'max_cost_per_call_usd');
  const budget = number(row, 'monthly_budget_usd');
  const averageCostUsd = number(row, 'average_cost_usd');
  const elapsedDays = Math.max(1, number(row, 'elapsed_days'));
  const daysInMonth = Math.max(elapsedDays, number(row, 'days_in_month'));
  const monthSpentUsd = number(row, 'month_spent');
  const forecastMonthUsd = roundUsd((monthSpentUsd / elapsedDays) * daysInMonth);
  const metrics = {
    calls,
    averageCostUsd: roundUsd(averageCostUsd),
    costCeilingPct: percent(averageCostUsd, ceiling),
    truncatedPct: percent(number(row, 'truncated'), calls),
    schemaFirstTryPct: percent(
      number(row, 'schema_first_try_ok'),
      number(row, 'schema_evaluated'),
      100,
    ),
    blockedPct: percent(number(row, 'blocked'), calls),
    providerErrorPct: percent(number(row, 'provider_errors'), calls),
    monthSpentUsd: roundUsd(monthSpentUsd),
    forecastMonthUsd,
    monthlyBudgetUsd: budget,
  };

  const warnings = [];
  if (metrics.costCeilingPct > 70) {
    warnings.push({ score: metrics.costCeilingPct / 70, label: `Sát trần ${formatPercent(metrics.costCeilingPct)}%` });
  }
  if (metrics.truncatedPct > 2) {
    warnings.push({ score: metrics.truncatedPct / 2, label: `${formatPercent(metrics.truncatedPct)}% bị cắt token` });
  }
  if (metrics.schemaFirstTryPct < 95) {
    warnings.push({ score: (100 - metrics.schemaFirstTryPct) / 5, label: `${formatPercent(metrics.schemaFirstTryPct)}% JSON đúng lần đầu` });
  }
  if (metrics.blockedPct > 0) {
    warnings.push({ score: 1 + metrics.blockedPct / 100, label: `${formatPercent(metrics.blockedPct)}% bị chặn` });
  }
  if (budget > 0 && forecastMonthUsd > budget) {
    const forecastPct = percent(forecastMonthUsd, budget);
    warnings.push({ score: forecastMonthUsd / budget, label: `Dự báo vượt ngân sách ${formatPercent(forecastPct)}%` });
  }
  if (metrics.providerErrorPct > 5) {
    warnings.push({ score: metrics.providerErrorPct / 5, label: `${formatPercent(metrics.providerErrorPct)}% lỗi provider` });
  }
  warnings.sort((a, b) => b.score - a.score);

  return {
    agentId: row.agent_id,
    agentKey: row.agent_key,
    level: warnings.length ? 'warn' : 'ok',
    label: warnings[0]?.label || 'Ổn định',
    metrics,
  };
}

function createHealth(database = db) {
  async function rows(agentId = null) {
    return (await database.query(HEALTH_SQL, [agentId])).rows;
  }

  async function agentHealth(agentId) {
    const row = (await rows(agentId))[0];
    return row ? healthFromRow(row) : null;
  }

  async function listHealth() {
    return (await rows()).map(healthFromRow);
  }

  async function forecastMonth(agentId) {
    const health = await agentHealth(agentId);
    return health?.metrics.forecastMonthUsd ?? null;
  }

  return { agentHealth, listHealth, forecastMonth };
}

const health = createHealth();

module.exports = { ...health, createHealth, healthFromRow, HEALTH_SQL };
