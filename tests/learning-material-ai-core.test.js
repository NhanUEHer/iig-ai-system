const test = require('node:test');
const assert = require('node:assert/strict');

const aiCore = require('../src/modules/ai-core');
const { AGENT_DEFINITIONS, AGENT_KEYS } = require('../src/modules/learning-materials/agents/definitions');
const client = require('../src/modules/learning-materials/agents/client');

test('learning material agents keep the Dify input contract', () => {
  assert.deepEqual(AGENT_DEFINITIONS.map(def => def.key), [AGENT_KEYS.keyVocab, AGENT_KEYS.dictionaryDetect, AGENT_KEYS.dictionaryDefine]);
  for (const def of AGENT_DEFINITIONS) {
    for (const name of def.variables) assert.match(def.userTemplate, new RegExp(`{{${name}}}`));
    assert.doesNotMatch(def.userTemplate, /{{#/);
    assert.equal(def.outputSchema.type, 'object');
  }
});

test('client calls the lm.* agents and maps AI Core errors', async t => {
  const calls = [];
  t.mock.method(aiCore, 'run', async (key, variables, ctx) => {
    calls.push({ key, variables, ctx });
    if (key === AGENT_KEYS.dictionaryDetect) {
      const error = new aiCore.AiCoreError('COST_CEILING', 'too expensive');
      throw error;
    }
    return { data: { w: [] }, callId: 'call-1' };
  });
  const vocab = await client.generateKeyVocab('passage', 'u1', 650, 'balanced');
  assert.deepEqual(vocab, { output: { w: [] }, callId: 'call-1' });
  assert.deepEqual(calls[0].variables, { reading_content: 'passage', target_score: '650', selection_mode: 'balanced' });
  assert.equal(calls[0].ctx.userId, 'u1');

  await client.generateEntries('p', 's', ['carry out'], 'u1', { refId: 'c1' });
  assert.equal(calls[1].key, AGENT_KEYS.dictionaryDefine);
  assert.equal(calls[1].variables.target_chunk, '["carry out"]');

  await assert.rejects(client.extractItems('p', 'u1'), error => error.code === 'AI_CORE_COST_CEILING' && error.retryable === false);
});
