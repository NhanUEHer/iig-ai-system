const { AiCoreError } = require('../errors');

async function inputGuard(state) {
  const inputTokens = Number(await state.adapter.countTokens({
    apiKey: state.connection.apiKey,
    baseUrl: state.connection.baseUrl,
    model: state.model || state.version.model,
    system: state.system,
    user: state.user,
    schema: state.version.outputSchema,
    timeoutMs: state.version.timeoutMs,
  }));
  const limit = Number(state.version.maxInputTokens);
  state.inputTokens = Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0;
  if (state.inputTokens > limit) {
    throw new AiCoreError(
      'INPUT_TOO_LARGE',
      `AI input contains ${state.inputTokens} tokens; the limit is ${limit}.`,
    );
  }
  return state;
}

module.exports = inputGuard;
module.exports.inputGuard = inputGuard;
