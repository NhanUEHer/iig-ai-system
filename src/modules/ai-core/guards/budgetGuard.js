const { AiCoreError } = require('../errors');
const defaultSpend = require('../usage/spend');

async function budgetGuard(state) {
  if (state.mode === 'test') return state;
  const spend = state.spend || defaultSpend;
  const budget = Number(state.agent.monthlyBudgetUsd);
  if (!Number.isFinite(budget) || typeof spend.monthSpent !== 'function') return state;
  const monthSpent = Number(await spend.monthSpent(state.agent.id));
  const estimate = Number(state.estimatedMaxCostUsd || state.estimatedMax || 0);
  state.monthSpentUsd = monthSpent;
  if (monthSpent + estimate > budget) {
    throw new AiCoreError(
      'QUOTA_EXCEEDED',
      `Monthly spend plus this estimate ($${(monthSpent + estimate).toFixed(8)}) exceeds the $${budget.toFixed(8)} budget.`,
    );
  }
  return state;
}

module.exports = budgetGuard;
module.exports.budgetGuard = budgetGuard;
