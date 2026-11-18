const test = require('node:test');
const assert = require('node:assert/strict');

test('AI Core editor detects unique template variables in display order', async () => {
  const { detectTemplateVariables } = await import('../frontend/src/features/ai-core/utils/agentEditorUtils.js');
  assert.deepEqual(
    detectTemplateVariables('Hello {{ name }} from {{location}}. Again {{name}}. Ignore {{ bad-name }}.'),
    ['name', 'location'],
  );
});

test('AI Core editor validates JSON schema text locally', async () => {
  const { validateJsonSchemaText } = await import('../frontend/src/features/ai-core/utils/agentEditorUtils.js');
  assert.equal(validateJsonSchemaText('{"type":"object"}').valid, true);
  assert.equal(validateJsonSchemaText('[]').valid, false);
  assert.match(validateJsonSchemaText('{ broken').error, /JSON chưa hợp lệ/);
});
