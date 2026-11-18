const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeDraft, createAgentService } = require('../src/modules/ai-core/agents/agentService');
const { createAgentsRouter } = require('../src/modules/ai-core/routes/agents');

const validDraft = {
  connectionId: '00000000-0000-0000-0000-000000000001', model: 'gemini-test',
  systemPrompt: 'Return JSON.', userTemplate: 'Hello {{name}}',
  variables: [{ name: 'name', required: true }],
  outputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  temperature: 0, maxInputTokens: 100, maxOutputTokens: 50, timeoutMs: 1000,
  maxRetries: 1, repairInvalidJson: true, changeNote: 'draft',
};

async function request(router, permissions, pathName, options = {}) {
  const method = options.method || 'GET';
  const layer = router.stack.find(item => item.route?.methods?.[method.toLowerCase()] && item.matchers[0](pathName));
  assert.ok(layer);
  const req = { params: layer.matchers[0](pathName).params, body: options.body || {}, auth: { userId: 'user-1', permissions } };
  const response = { status: 200 };
  const res = { status(code) { response.status = code; return this; }, json(value) { response.body = value; return this; } };
  let index = 0;
  async function next(error) { if (error) throw error; const current = layer.route.stack[index++]; if (current) return current.handle(req, res, next); }
  try { await next(); } catch (error) { response.status = error.statusCode || 500; response.body = { code: error.code }; }
  return response;
}

test('draft validation checks schema, variable matching, output limit, and retry range', () => {
  assert.equal(normalizeDraft(validDraft).maxRetries, 1);
  assert.throws(() => normalizeDraft({ ...validDraft, variables: [] }), { code: 'AI_CORE_TEMPLATE_VARIABLE_MISMATCH' });
  assert.throws(() => normalizeDraft({ ...validDraft, outputSchema: { type: 'not-a-json-schema-type' } }), { code: 'AI_CORE_INVALID_SCHEMA' });
  assert.throws(() => normalizeDraft({ ...validDraft, maxOutputTokens: 65537 }), { code: 'AI_CORE_INVALID_FIELD' });
  assert.throws(() => normalizeDraft({ ...validDraft, maxRetries: 6 }), { code: 'AI_CORE_INVALID_FIELD' });
});

test('create persists agent plus draft v1 and update rejects immutable fields', async () => {
  const sql = [];
  const database = {
    async query(statement) {
      sql.push(statement);
      if (/SELECT c.status/.test(statement)) return { rows: [{ connection_status: 'active', model_status: 'active', context_window: 1000 }] };
      if (/INSERT INTO aic_agents/.test(statement)) return { rows: [{ id: 'agent-1' }] };
      if (/SELECT \* FROM aic_agents/.test(statement)) return { rows: [agentRow()] };
      if (/SELECT \* FROM aic_agent_versions WHERE/.test(statement)) return { rows: [versionRow({ version: 1 })] };
      return { rows: [] };
    },
    async transaction(work) { return work(database); },
  };
  const service = createAgentService({ database, registry: { clearCache() {} }, health: { async listHealth() { return []; } } });
  const created = await service.create({ key: 'demo.agent', name: 'Demo', feature: 'demo', draft: validDraft }, 'user-1');
  assert.equal(created.draft.version, 1);
  assert.ok(sql.some(statement => /INSERT INTO aic_agents/.test(statement)));
  assert.ok(sql.some(statement => /INSERT INTO aic_agent_versions/.test(statement)));
  await assert.rejects(service.update('demo.agent', { feature: 'changed' }, 'user-1'), { code: 'AI_CORE_INVALID_FIELD' });
});

function agentRow() {
  return {
    id: 'agent-1', key: 'demo.agent', name: 'Demo', description: '', feature: 'demo', status: 'active',
    max_cost_per_call_usd: 1, monthly_budget_usd: 10, alert_threshold_pct: 80,
    max_concurrency: 4, published_version_id: 'published-1',
  };
}

function versionRow(overrides = {}) {
  return {
    id: 'draft-2', agent_id: 'agent-1', version: 2, status: 'draft',
    connection_id: validDraft.connectionId, model: validDraft.model,
    fallback_connection_id: null, fallback_model: null, system_prompt: validDraft.systemPrompt,
    user_template: validDraft.userTemplate, variables: validDraft.variables,
    output_schema: validDraft.outputSchema, temperature: 0, max_input_tokens: 100,
    max_output_tokens: 50, timeout_ms: 1000, max_retries: 1, repair_invalid_json: true,
    change_note: '', last_test_ok_at: '2026-11-18T00:00:00Z', ...overrides,
  };
}

test('saving a tested draft clears last_test_ok_at and therefore requires another test', async () => {
  const sql = [];
  const database = {
    async query(statement) {
      sql.push(statement);
      if (/SELECT \* FROM aic_agents/.test(statement)) return { rows: [agentRow()] };
      if (/SELECT \* FROM aic_agent_versions WHERE/.test(statement)) return { rows: [versionRow()] };
      if (/SELECT c.status/.test(statement)) return { rows: [{ connection_status: 'active', model_status: 'active', context_window: 1000 }] };
      if (/UPDATE aic_agent_versions SET/.test(statement)) return { rows: [] };
      if (/INSERT INTO aic_audit_logs/.test(statement)) return { rows: [] };
      throw new Error(`Unexpected SQL: ${statement}`);
    },
    async transaction(work) { return work(database); },
  };
  const service = createAgentService({ database, registry: { clearCache() {} }, health: { async listHealth() { return []; } } });
  await service.saveDraft('demo.agent', { changeNote: 'edited' }, 'user-1');
  assert.match(sql.find(statement => /UPDATE aic_agent_versions SET/.test(statement)), /last_test_ok_at=NULL/);
});

test('publish refuses an untested draft and archives the old published version on success', async () => {
  let tested = false;
  const sql = [];
  const database = {
    async query(statement) {
      sql.push(statement);
      if (/FOR UPDATE OF a/.test(statement)) return { rows: [{ agent_id: 'agent-1', published_version_id: 'published-1', draft_id: 'draft-2', last_test_ok_at: tested ? '2026-11-18T00:00:00Z' : null }] };
      if (/SELECT \* FROM aic_agents/.test(statement)) return { rows: [agentRow()] };
      if (/SELECT \* FROM aic_agent_versions WHERE/.test(statement)) return { rows: [versionRow({ status: 'published', id: 'draft-2' })] };
      return { rows: [] };
    },
    async transaction(work) { return work(database); },
  };
  const service = createAgentService({ database, registry: { clearCache() {} }, health: { async listHealth() { return []; } } });
  await assert.rejects(service.publish('demo.agent', 'user-1'), { code: 'AI_CORE_TEST_REQUIRED', statusCode: 409 });
  tested = true;
  await service.publish('demo.agent', 'user-1');
  assert.ok(sql.some(statement => /status='archived'/.test(statement)));
  assert.ok(sql.some(statement => /status='published'/.test(statement)));
  assert.ok(sql.some(statement => /published_version_id=\$2/.test(statement)));
});

test('restore replaces any draft with a new untested version copied from history', async () => {
  const sql = [];
  const historic = versionRow({ id: 'old-1', version: 1, status: 'archived' });
  const database = {
    async query(statement) {
      sql.push(statement);
      if (/JOIN aic_agent_versions v ON v.agent_id=a.id WHERE/.test(statement)) return { rows: [historic] };
      if (/SELECT \* FROM aic_agents/.test(statement)) return { rows: [agentRow()] };
      if (/SELECT \* FROM aic_agent_versions WHERE/.test(statement)) return { rows: [versionRow()] };
      if (/COALESCE\(MAX\(version\)/.test(statement)) return { rows: [{ version: 3 }] };
      return { rows: [] };
    },
    async transaction(work) { return work(database); },
  };
  const service = createAgentService({ database, registry: { clearCache() {} }, health: { async listHealth() { return []; } } });
  await service.restore('demo.agent', 1, 'user-1');
  assert.ok(sql.some(statement => /DELETE FROM aic_agent_versions.*status='draft'/.test(statement)));
  const insert = sql.find(statement => /INSERT INTO aic_agent_versions/.test(statement));
  assert.match(insert, /last_test_ok_at/);
  assert.match(insert, /NULL\)/);
});

test('run endpoint requires ai_core.run and delegates to the published-run SDK', async () => {
  const calls = [];
  const router = createAgentsRouter({
    agentService: {},
    aiCore: { async run(key, variables, context) { calls.push({ key, variables, context }); return { agentKey: key, version: 7, data: { ok: true } }; } },
  });
  const denied = await request(router, ['ai_core.view'], '/demo.agent/run', { method: 'POST', body: { variables: {} } });
  assert.equal(denied.status, 403);
  const allowed = await request(router, ['ai_core.run'], '/demo.agent/run', { method: 'POST', body: { variables: { name: 'A' }, ref: { type: 'item', id: '42' } } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.data.version, 7);
  assert.deepEqual(calls[0], { key: 'demo.agent', variables: { name: 'A' }, context: { userId: 'user-1', refType: 'item', refId: '42' } });
});
