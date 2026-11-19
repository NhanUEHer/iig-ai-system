const { AiCoreError, ERROR_CODES } = require('./errors');
const runner = require('./runtime/runner');
const registry = require('./agents/registry');
const { EXECUTION_VERSION_ID } = runner;

function createAiCore(dependencies = {}) {
  const runtime = dependencies.runner || runner;
  const agentRegistry = dependencies.registry || registry;

  async function run(key, variables, ctx = {}) {
    if (!key) throw new AiCoreError('CONFIG_MISSING', 'AI Core agent key is required.');
    return runtime.execute({ key, variables, ctx, mode: 'run' });
  }

  async function testRun(key, variables, userId) {
    const result = await runtime.execute({
      key,
      variables,
      ctx: { userId },
      mode: 'test',
    });
    await agentRegistry.markTestOk(result[EXECUTION_VERSION_ID]);
    return result;
  }

  return { run, testRun };
}

const sdk = createAiCore();

module.exports = { ...sdk, createAiCore, AiCoreError, ERROR_CODES };
