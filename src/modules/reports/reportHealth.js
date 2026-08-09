function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function healthScore(item) {
  const target = numericOrNull(item.target_value);
  const actual = numericOrNull(item.actual_value);
  if (target === null || actual === null || item.evaluation_direction === 'monitor') return null;
  if (target === 0) return actual > 0 ? 1.2 : null;
  if (item.evaluation_direction === 'decrease_good') return actual <= 0 ? 1.2 : target / actual;
  return actual / target;
}

function healthStatus(score) {
  return score === null ? 'missing' : score >= 1 ? 'good' : score >= 0.85 ? 'near' : 'risk';
}

module.exports = { numericOrNull, healthScore, healthStatus };
