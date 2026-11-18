const db = require('../../../config/db');
const defaultSpend = require('./spend');
const { monthWindow } = require('./spend');

function createAlerts(database = db, options = {}) {
  const spend = options.spend || defaultSpend;
  const now = options.now || (() => new Date());

  async function loadAgent(agentOrId) {
    if (agentOrId && typeof agentOrId === 'object') return agentOrId;
    const result = await database.query(
      `SELECT id, monthly_budget_usd, alert_threshold_pct
         FROM aic_agents WHERE id=$1`,
      [agentOrId],
    );
    return result.rows[0] || null;
  }

  async function insert(agentId, kind, month) {
    const result = await database.query(
      `INSERT INTO aic_alerts (agent_id, kind, month)
       VALUES ($1,$2,$3::date)
       ON CONFLICT (agent_id, kind, month) DO NOTHING
       RETURNING agent_id, kind, month, created_at`,
      [agentId, kind, month],
    );
    return result.rows[0] || null;
  }

  async function evaluateAgent(agentOrId) {
    const agent = await loadAgent(agentOrId);
    if (!agent) return [];
    const agentId = agent.id || agent.agent_id;
    const budget = Number(agent.monthlyBudgetUsd ?? agent.monthly_budget_usd);
    const threshold = Number(agent.alertThresholdPct ?? agent.alert_threshold_pct);
    if (!(budget > 0) || !(threshold > 0)) return [];
    const spent = Number(await spend.monthSpent(agentId));
    const percentage = (spent / budget) * 100;
    const month = monthWindow(now()).monthDay;
    const kinds = [];
    if (percentage >= threshold && threshold < 100) kinds.push(`budget_${threshold}`);
    if (percentage >= 100) kinds.push('budget_100');
    const created = [];
    for (const kind of kinds) {
      const alert = await insert(agentId, kind, month);
      if (alert) created.push(alert);
    }
    return created;
  }

  async function checkAll() {
    const result = await database.query(
      `SELECT id, monthly_budget_usd, alert_threshold_pct
         FROM aic_agents WHERE status='active'`,
    );
    const created = [];
    for (const agent of result.rows) created.push(...await evaluateAgent(agent));
    return created;
  }

  return { evaluateAgent, checkAll };
}

const alerts = createAlerts();

module.exports = { ...alerts, createAlerts };
