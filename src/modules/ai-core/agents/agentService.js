const Ajv2020 = require('ajv/dist/2020');
const db = require('../../../config/db');
const HttpError = require('../../../http/httpError');
const aiCore = require('..');
const registry = require('./registry');
const health = require('../usage/health');
const defaultAudit = require('../admin/audit');
const { createAudit } = require('../admin/audit');
const { requiredString, enumValue, numberValue, fail } = require('../admin/validation');
const { PLACEHOLDER } = require('../runtime/template');

const ajv = new Ajv2020({ strict: false, allErrors: true });
const KEY_PATTERN = /^[a-z0-9]+(?:\.[a-z0-9_]+)+$/;
const VARIABLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DRAFT_FIELDS = [
  'connectionId', 'model', 'fallbackConnectionId', 'fallbackModel', 'systemPrompt',
  'userTemplate', 'variables', 'outputSchema', 'temperature', 'thinkingMode', 'maxInputTokens',
  'maxOutputTokens', 'timeoutMs', 'maxRetries', 'repairInvalidJson', 'changeNote',
];

function json(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_error) { return fallback; }
}

function agentDto(row) {
  if (!row) return null;
  return {
    id: row.id, key: row.key, name: row.name, description: row.description || '', feature: row.feature,
    status: row.status, maxCostPerCallUsd: Number(row.max_cost_per_call_usd),
    monthlyBudgetUsd: Number(row.monthly_budget_usd), alertThresholdPct: Number(row.alert_threshold_pct),
    maxConcurrency: Number(row.max_concurrency), publishedVersionId: row.published_version_id,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function versionDto(row, prefix = '') {
  const get = key => row[`${prefix}${key}`];
  if (!get('id')) return null;
  return {
    id: get('id'), agentId: get('agent_id'), version: Number(get('version')), status: get('status'),
    connectionId: get('connection_id'), model: get('model'),
    fallbackConnectionId: get('fallback_connection_id'), fallbackModel: get('fallback_model'),
    systemPrompt: get('system_prompt') || '', userTemplate: get('user_template') || '',
    variables: json(get('variables'), []), outputSchema: json(get('output_schema'), {}),
    temperature: Number(get('temperature')), thinkingMode: get('thinking_mode') || 'off', maxInputTokens: Number(get('max_input_tokens')),
    maxOutputTokens: Number(get('max_output_tokens')), timeoutMs: Number(get('timeout_ms')),
    maxRetries: Number(get('max_retries')), repairInvalidJson: Boolean(get('repair_invalid_json')),
    changeNote: get('change_note') || '', lastTestOkAt: get('last_test_ok_at'),
    createdAt: get('created_at'), publishedAt: get('published_at'),
  };
}

function draftFromVersion(row) {
  const version = row?.connectionId ? row : versionDto(row);
  return Object.fromEntries(DRAFT_FIELDS.map(field => [field, version[field]]));
}

function validateAgentInput(input, { create = false } = {}) {
  const result = {};
  if (create || input.name !== undefined) result.name = requiredString(input.name, 'name', { max: 160 });
  if (create || input.feature !== undefined) result.feature = requiredString(input.feature, 'feature', { max: 120 });
  if (input.description !== undefined) result.description = String(input.description || '').slice(0, 2000);
  if (input.status !== undefined) result.status = enumValue(input.status, 'status', ['active', 'paused']);
  if (input.maxCostPerCallUsd !== undefined) result.maxCostPerCallUsd = numberValue(input.maxCostPerCallUsd, 'maxCostPerCallUsd');
  if (input.monthlyBudgetUsd !== undefined) result.monthlyBudgetUsd = numberValue(input.monthlyBudgetUsd, 'monthlyBudgetUsd');
  if (input.alertThresholdPct !== undefined) result.alertThresholdPct = numberValue(input.alertThresholdPct, 'alertThresholdPct', { min: 1, max: 100, integer: true });
  if (input.maxConcurrency !== undefined) result.maxConcurrency = numberValue(input.maxConcurrency, 'maxConcurrency', { min: 1, max: 100, integer: true });
  return result;
}

function normalizeDraft(input, base = {}) {
  const merged = { ...base, ...input };
  const variables = merged.variables;
  if (!Array.isArray(variables) || variables.length > 100) fail('variables must be an array with at most 100 items.', 'AI_CORE_INVALID_DRAFT');
  const names = variables.map(variable => requiredString(variable?.name, 'variable.name', { max: 80 }));
  if (names.some(name => !VARIABLE_PATTERN.test(name)) || new Set(names).size !== names.length) {
    fail('Variable names must be unique JavaScript-style identifiers.', 'AI_CORE_INVALID_DRAFT');
  }
  const placeholders = [...String(merged.userTemplate || '').matchAll(new RegExp(PLACEHOLDER.source, 'g'))].map(match => match[1]);
  const defined = [...new Set(names)].sort();
  const used = [...new Set(placeholders)].sort();
  if (JSON.stringify(defined) !== JSON.stringify(used)) {
    fail('Template placeholders must exactly match variables.', 'AI_CORE_TEMPLATE_VARIABLE_MISMATCH', 400, { defined, used });
  }
  if (!merged.outputSchema || typeof merged.outputSchema !== 'object' || Array.isArray(merged.outputSchema)
      || !ajv.validateSchema(merged.outputSchema)) {
    fail('outputSchema must be a valid JSON Schema.', 'AI_CORE_INVALID_SCHEMA');
  }
  try { ajv.compile(merged.outputSchema); } catch (_error) {
    fail('outputSchema must be a valid JSON Schema.', 'AI_CORE_INVALID_SCHEMA');
  }
  const fallbackConnectionId = merged.fallbackConnectionId || null;
  const fallbackModel = merged.fallbackModel || null;
  if (Boolean(fallbackConnectionId) !== Boolean(fallbackModel)) {
    fail('Fallback connection and model must be supplied together.', 'AI_CORE_INVALID_DRAFT');
  }
  return {
    connectionId: requiredString(merged.connectionId, 'connectionId', { max: 100 }),
    model: requiredString(merged.model, 'model', { max: 200 }), fallbackConnectionId, fallbackModel,
    systemPrompt: String(merged.systemPrompt || ''), userTemplate: String(merged.userTemplate || ''),
    variables: variables.map((variable, index) => ({
      name: names[index], required: Boolean(variable.required), description: String(variable.description || ''),
    })),
    outputSchema: merged.outputSchema,
    temperature: numberValue(merged.temperature ?? 0, 'temperature', { min: 0, max: 2 }),
    thinkingMode: ['off', 'low', 'medium', 'high', 'default'].includes(merged.thinkingMode) ? merged.thinkingMode : 'off',
    maxInputTokens: numberValue(merged.maxInputTokens, 'maxInputTokens', { min: 1, integer: true }),
    maxOutputTokens: numberValue(merged.maxOutputTokens, 'maxOutputTokens', { min: 1, max: 65536, integer: true }),
    timeoutMs: numberValue(merged.timeoutMs ?? 60000, 'timeoutMs', { min: 1000, max: 600000, integer: true }),
    maxRetries: numberValue(merged.maxRetries ?? 2, 'maxRetries', { min: 0, max: 5, integer: true }),
    repairInvalidJson: merged.repairInvalidJson === undefined ? true : Boolean(merged.repairInvalidJson),
    changeNote: String(merged.changeNote || '').slice(0, 1000),
  };
}

async function validateModel(database, connectionId, model, label = 'model') {
  const result = await database.query(
    `SELECT c.status AS connection_status, c.provider, m.status AS model_status, m.context_window
       FROM aic_connections c
       LEFT JOIN aic_models m ON m.provider=c.provider AND m.model=$2
      WHERE c.id=$1`,
    [connectionId, model],
  );
  const row = result.rows[0];
  if (!row || row.connection_status !== 'active') throw new HttpError(`${label} connection is not active.`, 400, 'AI_CORE_CONNECTION_INACTIVE');
  if (row.model_status !== 'active') throw new HttpError(`${label} has no active pricing.`, 400, 'AI_CORE_MODEL_UNPRICED');
  return Number(row.context_window);
}

function versionValues(agentId, version, draft, userId) {
  return [
    agentId, version, draft.connectionId, draft.model, draft.fallbackConnectionId, draft.fallbackModel,
    draft.systemPrompt, draft.userTemplate, JSON.stringify(draft.variables), JSON.stringify(draft.outputSchema),
    draft.temperature, draft.maxInputTokens, draft.maxOutputTokens, draft.timeoutMs, draft.maxRetries,
    draft.repairInvalidJson, draft.changeNote, userId, draft.thinkingMode || 'off',
  ];
}

function createAgentService(dependencies = {}) {
  const database = dependencies.database || db;
  const sdk = dependencies.aiCore || aiCore;
  const agentRegistry = dependencies.registry || registry;
  const healthService = dependencies.health || health;
  const auditLog = dependencies.audit || (dependencies.database ? createAudit(database) : defaultAudit);
  const transaction = work => typeof database.transaction === 'function' ? database.transaction(work) : work(database);

  async function validateDraft(draft) {
    const mainContext = await validateModel(database, draft.connectionId, draft.model);
    if (draft.maxInputTokens > mainContext) fail('maxInputTokens exceeds the model context window.', 'AI_CORE_CONTEXT_WINDOW_EXCEEDED');
    if (draft.fallbackConnectionId) {
      const fallbackContext = await validateModel(database, draft.fallbackConnectionId, draft.fallbackModel, 'fallbackModel');
      if (draft.maxInputTokens > fallbackContext) fail('maxInputTokens exceeds the fallback model context window.', 'AI_CORE_CONTEXT_WINDOW_EXCEEDED');
    }
  }

  async function list() {
    const rows = (await database.query(
      `SELECT a.*, p.id AS p_id, p.agent_id AS p_agent_id, p.version AS p_version,
              p.status AS p_status, p.connection_id AS p_connection_id, p.model AS p_model,
              p.max_input_tokens AS p_max_input_tokens, p.max_output_tokens AS p_max_output_tokens,
              COALESCE(monthly.spent,0) AS month_spent
         FROM aic_agents a
         LEFT JOIN aic_agent_versions p ON p.id=a.published_version_id
         LEFT JOIN LATERAL (
           SELECT SUM(cost_usd) AS spent FROM aic_call_logs l WHERE l.agent_id=a.id AND l.mode='run'
             AND l.created_at >= (date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')
         ) monthly ON TRUE ORDER BY LOWER(a.name), a.key`,
    )).rows;
    const healthById = new Map((await healthService.listHealth()).map(item => [item.agentId, item]));
    return rows.map(row => ({
      ...agentDto(row),
      published: row.p_id ? {
        id: row.p_id, version: Number(row.p_version), model: row.p_model,
        maxInputTokens: Number(row.p_max_input_tokens), maxOutputTokens: Number(row.p_max_output_tokens),
      } : null,
      monthSpentUsd: Number(row.month_spent), health: healthById.get(row.id) || null,
    }));
  }

  async function get(key) {
    const agentResult = await database.query('SELECT * FROM aic_agents WHERE key=$1', [key]);
    const agent = agentDto(agentResult.rows[0]);
    if (!agent) return null;
    const versions = (await database.query(
      `SELECT * FROM aic_agent_versions WHERE agent_id=$1 AND status IN ('published','draft') ORDER BY version DESC`, [agent.id],
    )).rows.map(row => versionDto(row));
    return { ...agent, published: versions.find(item => item.status === 'published') || null, draft: versions.find(item => item.status === 'draft') || null };
  }

  async function create(input, userId = null) {
    if (!KEY_PATTERN.test(String(input.key || ''))) fail('key has an invalid format.', 'AI_CORE_INVALID_AGENT_KEY');
    const agent = validateAgentInput(input, { create: true });
    const draft = normalizeDraft(input.draft || {});
    await validateDraft(draft);
    await transaction(async client => {
      const inserted = (await client.query(
        `INSERT INTO aic_agents (
           key,name,description,feature,status,max_cost_per_call_usd,monthly_budget_usd,
           alert_threshold_pct,max_concurrency,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id`,
        [input.key, agent.name, agent.description || '', agent.feature, agent.status || 'active',
          agent.maxCostPerCallUsd ?? 0, agent.monthlyBudgetUsd ?? 0, agent.alertThresholdPct ?? 80,
          agent.maxConcurrency ?? 4, userId],
      )).rows[0];
      await client.query(
        `INSERT INTO aic_agent_versions (
           agent_id,version,status,connection_id,model,fallback_connection_id,fallback_model,
           system_prompt,user_template,variables,output_schema,temperature,max_input_tokens,
           max_output_tokens,timeout_ms,max_retries,repair_invalid_json,change_note,created_by,thinking_mode
         ) VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        versionValues(inserted.id, 1, draft, userId),
      );
      await createAudit(client).write({ resourceType: 'agent', resourceId: input.key, action: 'agent.created', actorId: userId, fields: ['key', ...Object.keys(agent), 'draft'] });
    });
    agentRegistry.clearCache();
    return get(input.key);
  }

  async function update(key, patch, userId = null) {
    const allowed = new Set(['name', 'description', 'status', 'maxCostPerCallUsd', 'monthlyBudgetUsd', 'alertThresholdPct', 'maxConcurrency']);
    if (Object.keys(patch || {}).some(field => !allowed.has(field))) fail('Only mutable agent fields may be updated.', 'AI_CORE_INVALID_FIELD');
    const values = validateAgentInput(patch);
    const mapping = {
      name: 'name', description: 'description', status: 'status', maxCostPerCallUsd: 'max_cost_per_call_usd',
      monthlyBudgetUsd: 'monthly_budget_usd', alertThresholdPct: 'alert_threshold_pct', maxConcurrency: 'max_concurrency',
    };
    if (!Object.keys(values).length) fail('No supported agent fields were supplied.', 'AI_CORE_INVALID_FIELD');
    await transaction(async client => {
      const params = [key];
      const sets = Object.entries(values).map(([field, value]) => { params.push(value); return `${mapping[field]}=$${params.length}`; });
      params.push(userId);
      const result = await client.query(
        `UPDATE aic_agents SET ${sets.join(',')},updated_by=$${params.length},updated_at=CURRENT_TIMESTAMP WHERE key=$1 RETURNING id`, params,
      );
      if (!result.rows[0]) throw new HttpError('Agent not found.', 404, 'AI_CORE_AGENT_NOT_FOUND');
      await createAudit(client).write({ resourceType: 'agent', resourceId: key, action: 'agent.updated', actorId: userId, fields: Object.keys(values) });
    });
    agentRegistry.clearCache();
    return get(key);
  }

  async function saveDraft(key, input, userId = null) {
    if (Object.keys(input || {}).some(field => !DRAFT_FIELDS.includes(field))) fail('Draft contains unsupported fields.', 'AI_CORE_INVALID_FIELD');
    const current = await get(key);
    if (!current) throw new HttpError('Agent not found.', 404, 'AI_CORE_AGENT_NOT_FOUND');
    const base = current.draft || current.published;
    if (!base) fail('Agent has no version to edit.', 'AI_CORE_CONFIG_MISSING', 409);
    const draft = normalizeDraft(input || {}, Object.fromEntries(DRAFT_FIELDS.map(field => [field, base[field]])));
    await validateDraft(draft);
    await transaction(async client => {
      if (current.draft) {
        await client.query(
          `UPDATE aic_agent_versions SET
             connection_id=$2,model=$3,fallback_connection_id=$4,fallback_model=$5,system_prompt=$6,
             user_template=$7,variables=$8::jsonb,output_schema=$9::jsonb,temperature=$10,
             max_input_tokens=$11,max_output_tokens=$12,timeout_ms=$13,max_retries=$14,
             repair_invalid_json=$15,change_note=$16,last_test_ok_at=NULL,created_by=$17,thinking_mode=$18
           WHERE id=$1 AND status='draft'`,
          [current.draft.id, ...versionValues(current.id, current.draft.version, draft, userId).slice(2)],
        );
      } else {
        const next = Number((await client.query('SELECT COALESCE(MAX(version),0)+1 AS version FROM aic_agent_versions WHERE agent_id=$1', [current.id])).rows[0].version);
        await client.query(
          `INSERT INTO aic_agent_versions (
             agent_id,version,status,connection_id,model,fallback_connection_id,fallback_model,
             system_prompt,user_template,variables,output_schema,temperature,max_input_tokens,
             max_output_tokens,timeout_ms,max_retries,repair_invalid_json,change_note,created_by,last_test_ok_at,thinking_mode
           ) VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,NULL,$19)`,
          versionValues(current.id, next, draft, userId),
        );
      }
      await createAudit(client).write({ resourceType: 'agent', resourceId: key, action: 'agent.draft_saved', actorId: userId, fields: DRAFT_FIELDS.filter(field => Object.hasOwn(input || {}, field)) });
    });
    agentRegistry.clearCache();
    return (await get(key)).draft;
  }

  async function test(key, variables, userId = null, images = undefined) {
    const current = await get(key);
    if (!current?.draft) throw new HttpError('Agent draft not found.', 409, 'AI_CORE_DRAFT_NOT_FOUND');
    const result = await sdk.testRun(key, variables || {}, userId, { images });
    const preview = (await database.query(
      'SELECT request_preview,response_preview FROM aic_call_logs WHERE id=$1', [result.callId],
    )).rows[0] || {};
    await auditLog.write({ resourceType: 'agent', resourceId: key, action: 'agent.tested', actorId: userId, fields: [] });
    return {
      ...result,
      checks: { schemaOk: true, notTruncated: true, underCeiling: Number(result.costUsd) <= current.maxCostPerCallUsd },
      preview: { request: preview.request_preview || null, response: preview.response_preview || null },
    };
  }

  async function publish(key, userId = null) {
    await transaction(async client => {
      const row = (await client.query(
        `SELECT a.id AS agent_id,a.published_version_id,v.id AS draft_id,v.last_test_ok_at
           FROM aic_agents a LEFT JOIN aic_agent_versions v ON v.agent_id=a.id AND v.status='draft'
          WHERE a.key=$1 FOR UPDATE OF a`, [key],
      )).rows[0];
      if (!row) throw new HttpError('Agent not found.', 404, 'AI_CORE_AGENT_NOT_FOUND');
      if (!row.draft_id) throw new HttpError('Agent draft not found.', 409, 'AI_CORE_DRAFT_NOT_FOUND');
      if (!row.last_test_ok_at) throw new HttpError('Draft must pass a test after its latest edit.', 409, 'AI_CORE_TEST_REQUIRED');
      if (row.published_version_id) {
        await client.query("UPDATE aic_agent_versions SET status='archived' WHERE id=$1 AND status='published'", [row.published_version_id]);
      }
      await client.query(
        `UPDATE aic_agent_versions SET status='published',published_by=$2,published_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [row.draft_id, userId],
      );
      await client.query(
        'UPDATE aic_agents SET published_version_id=$2,updated_by=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1',
        [row.agent_id, row.draft_id, userId],
      );
      await createAudit(client).write({ resourceType: 'agent', resourceId: key, action: 'agent.published', actorId: userId, fields: ['publishedVersionId'] });
    });
    agentRegistry.clearCache();
    return get(key);
  }

  async function versions(key) {
    const result = await database.query(
      `SELECT v.*,
              COUNT(l.id)::int AS calls, COALESCE(SUM(l.cost_usd),0) AS cost_usd,
              COUNT(l.id) FILTER (WHERE l.status='success')::int AS success,
              COUNT(l.id) FILTER (WHERE l.schema_valid_first_try IS TRUE)::int AS schema_first_try_ok,
              COUNT(l.id) FILTER (WHERE l.finish_reason='length')::int AS truncated
         FROM aic_agents a JOIN aic_agent_versions v ON v.agent_id=a.id
         LEFT JOIN aic_call_logs l ON l.version_id=v.id
          AND ((v.status='draft' AND l.mode='test') OR (v.status<>'draft' AND l.mode='run'))
        WHERE a.key=$1 GROUP BY v.id ORDER BY v.version DESC`, [key],
    );
    return result.rows.map(row => ({
      ...versionDto(row),
      usage: {
        calls: Number(row.calls), success: Number(row.success), costUsd: Number(row.cost_usd),
        schemaFirstTryOk: Number(row.schema_first_try_ok), truncated: Number(row.truncated),
      },
    }));
  }

  async function findVersion(key, version) {
    const row = (await database.query(
      `SELECT v.* FROM aic_agents a JOIN aic_agent_versions v ON v.agent_id=a.id WHERE a.key=$1 AND v.version=$2`,
      [key, version],
    )).rows[0];
    return versionDto(row);
  }

  function lineDiff(a, b) {
    const left = String(a || '').split('\n');
    const right = String(b || '').split('\n');
    const length = Math.max(left.length, right.length);
    return Array.from({ length }, (_, index) => left[index] === right[index] ? null : ({ line: index + 1, a: left[index] ?? null, b: right[index] ?? null })).filter(Boolean);
  }

  async function diff(key, a, b) {
    const [left, right] = await Promise.all([findVersion(key, a), findVersion(key, b)]);
    if (!left || !right) throw new HttpError('Agent version not found.', 404, 'AI_CORE_VERSION_NOT_FOUND');
    const textFields = new Set(['systemPrompt', 'userTemplate', 'outputSchema']);
    const parameters = {};
    for (const field of DRAFT_FIELDS.filter(field => !textFields.has(field))) {
      if (JSON.stringify(left[field]) !== JSON.stringify(right[field])) parameters[field] = { a: left[field], b: right[field] };
    }
    return {
      a: left.version, b: right.version, parameters,
      systemPrompt: lineDiff(left.systemPrompt, right.systemPrompt),
      userTemplate: lineDiff(left.userTemplate, right.userTemplate),
      outputSchema: lineDiff(JSON.stringify(left.outputSchema, null, 2), JSON.stringify(right.outputSchema, null, 2)),
    };
  }

  async function restore(key, version, userId = null) {
    const source = await findVersion(key, version);
    const current = await get(key);
    if (!source || !current) throw new HttpError('Agent version not found.', 404, 'AI_CORE_VERSION_NOT_FOUND');
    await transaction(async client => {
      await client.query("DELETE FROM aic_agent_versions WHERE agent_id=$1 AND status='draft'", [current.id]);
      const next = Number((await client.query('SELECT COALESCE(MAX(version),0)+1 AS version FROM aic_agent_versions WHERE agent_id=$1', [current.id])).rows[0].version);
      const restored = normalizeDraft(draftFromVersion(source));
      await client.query(
        `INSERT INTO aic_agent_versions (
           agent_id,version,status,connection_id,model,fallback_connection_id,fallback_model,
           system_prompt,user_template,variables,output_schema,temperature,max_input_tokens,
           max_output_tokens,timeout_ms,max_retries,repair_invalid_json,change_note,created_by,last_test_ok_at,thinking_mode
         ) VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,NULL,$19)`,
        versionValues(current.id, next, restored, userId),
      );
      await createAudit(client).write({ resourceType: 'agent', resourceId: key, action: 'agent.version_restored', actorId: userId, fields: [`version:${source.version}`] });
    });
    agentRegistry.clearCache();
    return (await get(key)).draft;
  }

  return { list, get, create, update, saveDraft, test, publish, versions, diff, restore, validateDraft };
}

const service = createAgentService();
module.exports = { ...service, createAgentService, agentDto, versionDto, normalizeDraft, KEY_PATTERN };
