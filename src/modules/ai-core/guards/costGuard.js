const { AiCoreError } = require('../errors');
const { estimateMax } = require('../pricing/cost');

async function costGuard(state) {
  const estimate = estimateMax({
    inputTokens: state.inputTokens,
    maxOutputTokens: state.version.maxOutputTokens,
    price: state.price,
  });
  const limit = Number(state.agent.maxCostPerCallUsd);
  state.estimatedMaxCostUsd = estimate;
  state.estimatedMax = estimate;
  if (Number.isFinite(limit) && estimate > limit) {
    throw new AiCoreError(
      'COST_CEILING',
      `Estimated maximum cost $${estimate.toFixed(8)} exceeds the per-call limit $${limit.toFixed(8)}.`,
    );
  }
  return state;
}

module.exports = costGuard;
module.exports.costGuard = costGuard;
