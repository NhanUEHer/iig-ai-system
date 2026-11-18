const { AiCoreError, ERROR_CODES } = require('./errors');

async function run() {
  throw new AiCoreError('CONFIG_MISSING', 'AI Core is not configured.');
}

module.exports = { run, AiCoreError, ERROR_CODES };
