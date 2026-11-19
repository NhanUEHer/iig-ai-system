#!/usr/bin/env node
// Create (or update the draft of) the “Tạo học liệu” AI Core agents defined in
// src/modules/learning-materials/agents/definitions.js. Never publishes: test and publish in the AI Core UI.
//
// Usage: node scripts/ai-core-seed-learning-material.js --primary "Gemini Test" [--model gemini-3.8-flash]
//        [--fallback "DS Test" --fallback-model deepseek-flash]
const db = require('../src/config/db');
const agentService = require('../src/modules/ai-core/agents/agentService');
const { AGENT_DEFINITIONS } = require('../src/modules/learning-materials/agents/definitions');

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
}

async function connectionId(name) {
  const { rows: [row] } = await db.query('SELECT id FROM aic_connections WHERE name = $1', [name]);
  if (!row) throw new Error(`Connection "${name}" not found.`);
  return row.id;
}

(async () => {
  const primary = await connectionId(arg('primary', 'Gemini Test'));
  const fallbackName = arg('fallback', '');
  const fallback = fallbackName ? await connectionId(fallbackName) : null;
  for (const def of AGENT_DEFINITIONS) {
    const draft = {
      // The Dify flows ran on gemini-3.8-flash; keep it as the default so output quality matches.
      connectionId: primary, model: arg('model', 'gemini-3.8-flash'),
      fallbackConnectionId: fallback, fallbackModel: fallback ? arg('fallback-model', 'deepseek-flash') : null,
      systemPrompt: def.systemPrompt, userTemplate: def.userTemplate, outputSchema: def.outputSchema,
      variables: def.variables.map(name => ({ name, required: true, description: '' })),
      temperature: 0.2, thinkingMode: 'off', maxInputTokens: def.maxInputTokens, maxOutputTokens: def.maxOutputTokens,
      // Dictionary worker gives up on a batch after DICTIONARY_CANDIDATE_TIMEOUT_MS (150s); stay under it.
      timeoutMs: 60000, maxRetries: 1, repairInvalidJson: true, changeNote: 'Seed từ learning-materials/agents/definitions.js (port Dify)',
    };
    const existing = await agentService.get(def.key);
    if (existing) {
      await agentService.saveDraft(def.key, draft);
      console.log(`updated draft ${def.key}`);
    } else {
      await agentService.create({
        key: def.key, name: def.name, feature: def.feature, description: def.description,
        maxCostPerCallUsd: def.ceiling, monthlyBudgetUsd: 20, alertThresholdPct: 80, maxConcurrency: 6, draft,
      });
      console.log(`created ${def.key}`);
    }
  }
  process.exit(0);
})().catch(error => { console.error(error.message); process.exit(1); });
