const db = require('../../../config/db');
const { AiCoreError } = require('../errors');

const CACHE_TTL_MS = 60 * 1000;

function jsonValue(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_error) { return fallback; }
}

function toAgent(row) {
  return {
    id: row.agent_id,
    key: row.agent_key,
    name: row.agent_name,
    description: row.agent_description,
    feature: row.agent_feature,
    status: row.agent_status,
    maxCostPerCallUsd: Number(row.max_cost_per_call_usd || 0),
    monthlyBudgetUsd: Number(row.monthly_budget_usd || 0),
    alertThresholdPct: Number(row.alert_threshold_pct || 0),
    maxConcurrency: Number(row.max_concurrency || 0),
    publishedVersionId: row.published_version_id,
  };
}

function toVersion(row) {
  return {
    id: row.version_id,
    agentId: row.agent_id,
    version: Number(row.version),
    status: row.version_status,
    connectionId: row.connection_id,
    model: row.model,
    fallbackConnectionId: row.fallback_connection_id,
    fallbackModel: row.fallback_model,
    systemPrompt: row.system_prompt || '',
    userTemplate: row.user_template || '',
    variables: jsonValue(row.variables, []),
    outputSchema: jsonValue(row.output_schema, {}),
    temperature: Number(row.temperature || 0),
    maxInputTokens: Number(row.max_input_tokens),
    maxOutputTokens: Number(row.max_output_tokens),
    timeoutMs: Number(row.timeout_ms),
    maxRetries: Number(row.max_retries),
    repairInvalidJson: Boolean(row.repair_invalid_json),
    lastTestOkAt: row.last_test_ok_at,
  };
}

function configMissing(key, mode) {
  const versionName = mode === 'test' ? 'draft' : 'published version';
  return new AiCoreError('CONFIG_MISSING', `Agent ${key} has no ${versionName}.`);
}

function createRegistry(database = db, options = {}) {
  const now = options.now || Date.now;
  const cacheByVersionId = new Map();
  const versionIdByLookup = new Map();

  function clearCache() {
    cacheByVersionId.clear();
    versionIdByLookup.clear();
  }

  function cached(lookupKey) {
    const versionId = versionIdByLookup.get(lookupKey);
    const entry = versionId && cacheByVersionId.get(versionId);
    if (!entry || entry.expiresAt <= now()) {
      if (versionId) cacheByVersionId.delete(versionId);
      versionIdByLookup.delete(lookupKey);
      return null;
    }
    return entry.value;
  }

  async function load(key, { mode = 'run' } = {}) {
    const lookupKey = `${mode}\u0000${key}`;
    const hit = cached(lookupKey);
    if (hit) return hit;

    const testMode = mode === 'test';
    const result = await database.query(
      `SELECT
         a.id AS agent_id, a.key AS agent_key, a.name AS agent_name,
         a.description AS agent_description, a.feature AS agent_feature,
         a.status AS agent_status, a.max_cost_per_call_usd, a.monthly_budget_usd,
         a.alert_threshold_pct, a.max_concurrency, a.published_version_id,
         v.id AS version_id, v.version, v.status AS version_status, v.connection_id,
         v.model, v.fallback_connection_id, v.fallback_model, v.system_prompt,
         v.user_template, v.variables, v.output_schema, v.temperature,
         v.max_input_tokens, v.max_output_tokens, v.timeout_ms, v.max_retries,
         v.repair_invalid_json, v.last_test_ok_at
       FROM aic_agents a
       LEFT JOIN aic_agent_versions v ON v.agent_id=a.id
        AND ${testMode ? "v.status='draft'" : 'v.id=a.published_version_id'}
       WHERE a.key=$1
       ${testMode ? 'ORDER BY v.version DESC' : ''}
       LIMIT 1`,
      [key],
    );
    const row = result.rows[0];
    if (row?.agent_status === 'paused') {
      throw new AiCoreError('AGENT_PAUSED', `Agent ${key} is paused.`);
    }
    if (!row || !row.version_id) throw configMissing(key, mode);

    const value = { agent: toAgent(row), version: toVersion(row) };
    cacheByVersionId.set(value.version.id, { value, expiresAt: now() + CACHE_TTL_MS });
    versionIdByLookup.set(lookupKey, value.version.id);
    return value;
  }

  async function markTestOk(versionId) {
    const result = await database.query(
      `UPDATE aic_agent_versions
          SET last_test_ok_at=CURRENT_TIMESTAMP
        WHERE id=$1 AND status='draft'
        RETURNING last_test_ok_at`,
      [versionId],
    );
    const entry = cacheByVersionId.get(versionId);
    if (entry && result.rows[0]) entry.value.version.lastTestOkAt = result.rows[0].last_test_ok_at;
    return result.rows[0]?.last_test_ok_at || null;
  }

  return { load, markTestOk, clearCache };
}

const registry = createRegistry();

module.exports = { ...registry, createRegistry, toAgent, toVersion, CACHE_TTL_MS };
