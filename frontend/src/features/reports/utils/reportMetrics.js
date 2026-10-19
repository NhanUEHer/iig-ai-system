export function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function healthScore(kpi) {
  const target = numberOrNull(kpi.target_value);
  const actual = numberOrNull(kpi.actual_value);
  if (target === null || actual === null || kpi.evaluation_direction === 'monitor') return null;
  if (target === 0) return actual > 0 ? 1.2 : null;
  if (kpi.evaluation_direction === 'decrease_good') return actual <= 0 ? 1.2 : target / actual;
  return actual / target;
}

export function actualTargetRatio(kpi) {
  const target = numberOrNull(kpi.target_value);
  const actual = numberOrNull(kpi.actual_value);
  if (target === null || actual === null || target === 0) return null;
  return actual / target;
}

export const healthStatus = score => score === null ? 'missing' : score >= 1 ? 'good' : score >= 0.85 ? 'near' : 'risk';
