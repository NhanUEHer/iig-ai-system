const LIST_QUERY_KEYS = Object.freeze({
  jobs: Object.freeze(['limit', 'cursor', 'search', 'status', 'scope', 'from', 'to', 'hasRetry', 'tenantId']),
  tenants: Object.freeze(['limit', 'cursor', 'search', 'status', 'environment', 'tenantId']),
  tenantAudit: Object.freeze(['limit', 'cursor', 'tenantId']),
  webhookDeliveries: Object.freeze(['limit', 'cursor', 'tenantId']),
});

export function aiScoringListQuery(endpoint, params = {}) {
  const allowed = LIST_QUERY_KEYS[endpoint];
  if (!allowed) throw new TypeError(`Unknown AI Scoring list endpoint: ${endpoint}`);
  const unknown = Object.keys(params).filter(key => !allowed.includes(key));
  if (unknown.length) {
    throw new TypeError(`Unsupported ${endpoint} query parameter(s): ${unknown.join(', ')}`);
  }
  return params;
}

export { LIST_QUERY_KEYS as AI_SCORING_LIST_QUERY_KEYS };
