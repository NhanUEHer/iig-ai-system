const { AiCoreError } = require('../errors');
const defaultRegistry = require('../agents/registry');
const defaultProviders = require('../providers');
const defaultConnections = require('../providers/connectionStore');
const defaultPrices = require('../pricing/prices');
const defaultCallLog = require('../usage/callLog');
const defaultSpend = require('../usage/spend');
const { actual, normalizedPrice, roundUsd, sumUsage } = require('../pricing/cost');
const { render } = require('./template');
const { parseAndValidate } = require('./schema');
const inputGuard = require('../guards/inputGuard');
const costGuard = require('../guards/costGuard');
const budgetGuard = require('../guards/budgetGuard');
const limiter = require('../guards/limiter');
const retry = require('../guards/retry');

const EMPTY_USAGE = Object.freeze({ input: 0, cachedInput: 0, output: 0, thinking: 0 });
const EXECUTION_VERSION_ID = Symbol('aiCore.executionVersionId');

function safeError(error, providerAttempted) {
  if (error instanceof AiCoreError) return error;
  return providerAttempted
    ? new AiCoreError('PROVIDER_DOWN', 'AI provider request failed.')
    : new AiCoreError('CONFIG_MISSING', 'AI Core configuration could not be loaded.');
}

function repairPrompt(output, errors, schema) {
  return [
    'Repair the following output so it validates against the JSON schema.',
    'Return only the corrected JSON. Do not use Markdown fences or add an explanation.',
    `Validation errors:\n${errors.map(error => `- ${error}`).join('\n')}`,
    `JSON schema:\n${JSON.stringify(schema)}`,
    `Output to repair:\n${output}`,
  ].join('\n\n');
}

function createRunner(dependencies = {}) {
  const registry = dependencies.registry || defaultRegistry;
  const providers = dependencies.providers || defaultProviders;
  const connections = dependencies.connectionStore || dependencies.connections || defaultConnections;
  const prices = dependencies.priceStore || dependencies.prices || defaultPrices;
  const logger = dependencies.callLog || dependencies.logger || defaultCallLog;
  const spend = dependencies.spend || defaultSpend;
  const clock = dependencies.now || Date.now;
  const guards = {
    input: dependencies.guards?.input || inputGuard,
    cost: dependencies.guards?.cost || costGuard,
    budget: dependencies.guards?.budget || budgetGuard,
    limiter: dependencies.guards?.limiter || limiter,
    retry: dependencies.guards?.retry || retry,
  };

  async function resolveProvider(connectionId, model) {
    let connection = connections.get ? await connections.get(connectionId) : null;
    if (!connection && connections.getWithKey) connection = await connections.getWithKey(connectionId);
    if (!connection || connection.status !== 'active') {
      throw new AiCoreError('CONFIG_MISSING', 'AI provider connection is not active.');
    }
    const adapter = providers.get(connection.provider);
    if (adapter.name !== 'fake' && !connection.apiKey) {
      connection = await connections.getWithKey(connectionId);
    }
    if (!connection || connection.status !== 'active') {
      throw new AiCoreError('CONFIG_MISSING', 'AI provider connection is not active.');
    }
    const price = await prices.getPrice(connection.provider, model);
    return { adapter, connection, price, model };
  }

  async function execute({ key, variables = {}, ctx = {}, mode = 'run' }) {
    const startedAt = clock();
    const usageParts = [];
    let agent;
    let version;
    let adapter;
    let connection;
    let price;
    let user = '';
    let responseText = null;
    let finishReason = null;
    let attempts = 0;
    let estimatedMaxCostUsd = 0;
    let repaired = false;
    let schemaValidFirstTry = null;
    let data;
    let caught;
    let callId = null;
    let usedFallback = false;

    function totalCost() {
      return roundUsd(usageParts.reduce(
        (total, part) => total + actual({ usage: part.usage, price: part.price }),
        0,
      ));
    }

    try {
      ({ agent, version } = await registry.load(key, { mode }));
      user = render(version.userTemplate, variables, version.variables);
      ({ adapter, connection, price } = await resolveProvider(version.connectionId, version.model));

      const state = {
        key, variables, ctx, mode, agent, version, adapter, connection, price,
        model: version.model, system: version.systemPrompt, user, spend,
      };
      await guards.input(state);
      await guards.cost(state);
      estimatedMaxCostUsd = Number(state.estimatedMaxCostUsd || state.estimatedMax || 0);
      await guards.budget(state);

      const invokeSelected = async generateUser => guards.limiter(state, () => guards.retry(state, async () => {
        attempts += 1;
        try {
          return await adapter.generate({
            apiKey: connection.apiKey,
            baseUrl: connection.baseUrl,
            model: state.model,
            system: version.systemPrompt,
            user: generateUser,
            schema: version.outputSchema,
            temperature: version.temperature,
            maxOutputTokens: version.maxOutputTokens,
            timeoutMs: version.timeoutMs,
          });
        } catch (error) {
          if (error?.usage) usageParts.push({ usage: error.usage, price });
          throw error;
        }
      }));

      const generate = async (generateUser = user) => {
        let providerResult;
        try {
          providerResult = await invokeSelected(generateUser);
        } catch (error) {
          const canFallback = !usedFallback
            && version.fallbackConnectionId
            && version.fallbackModel
            && (error?.retryable || error?.code === 'PROVIDER_DOWN' || error?.code === 'TIMEOUT');
          if (!canFallback) throw error;
          usedFallback = true;
          ({ adapter, connection, price } = await resolveProvider(
            version.fallbackConnectionId,
            version.fallbackModel,
          ));
          Object.assign(state, {
            adapter,
            connection,
            price,
            model: version.fallbackModel,
            user: generateUser,
          });
          await guards.input(state);
          await guards.cost(state);
          estimatedMaxCostUsd = Number(state.estimatedMaxCostUsd || state.estimatedMax || 0);
          providerResult = await invokeSelected(generateUser);
        }
        usageParts.push({ usage: providerResult.usage || EMPTY_USAGE, price });
        responseText = providerResult.text;
        finishReason = providerResult.finishReason;
        if (finishReason === 'length') {
          throw new AiCoreError('OUTPUT_TRUNCATED', 'AI provider output reached the token limit.');
        }
        return providerResult;
      };

      let providerResult = await generate();
      let checked = parseAndValidate(providerResult.text, version.outputSchema);
      schemaValidFirstTry = checked.valid;
      if (!checked.valid && version.repairInvalidJson) {
        repaired = true;
        providerResult = await generate(repairPrompt(providerResult.text, checked.errors, version.outputSchema));
        checked = parseAndValidate(providerResult.text, version.outputSchema);
      }
      if (!checked.valid) {
        throw new AiCoreError('SCHEMA_INVALID', `AI output does not match schema: ${checked.errors.join('; ')}`);
      }
      data = checked.data;
    } catch (error) {
      caught = safeError(error, attempts > 0);
    } finally {
      const usage = sumUsage(usageParts.map(part => part.usage));
      const blockedCodes = new Set([
        'CONFIG_MISSING', 'AGENT_PAUSED', 'VARIABLES_INVALID', 'INPUT_TOO_LARGE',
        'COST_CEILING', 'QUOTA_EXCEEDED',
      ]);
      const blocked = caught && (blockedCodes.has(caught.code) || attempts === 0);
      const costUsd = blocked ? 0 : totalCost();
      const status = caught ? (blocked ? 'blocked' : 'failed') : 'success';
      callId = await logger.write({
        agentId: agent?.id,
        versionId: version?.id,
        agentKey: key,
        version: version?.version,
        mode,
        feature: ctx.feature || agent?.feature || 'unknown',
        refType: ctx.refType,
        refId: ctx.refId,
        userId: ctx.userId,
        provider: adapter?.name || connection?.provider,
        model: usedFallback ? version?.fallbackModel : version?.model,
        connectionId: connection?.id || version?.connectionId,
        usedFallback,
        attempts,
        status,
        errorCode: caught?.code,
        errorMessage: caught?.message,
        finishReason,
        inputTokens: usage.input,
        cachedInputTokens: usage.cachedInput,
        outputTokens: usage.output,
        thinkingTokens: usage.thinking,
        estimatedMaxCostUsd,
        costUsd,
        priceSnapshot: price ? normalizedPrice(price) : {},
        schemaValidFirstTry,
        repaired,
        latencyMs: Math.max(0, clock() - startedAt),
        requestPreview: { system: version?.systemPrompt || '', user },
        responsePreview: responseText,
        agent,
      });
      if (!blocked && mode === 'run' && costUsd > 0 && agent?.id && typeof spend.bump === 'function') {
        spend.bump(agent.id, costUsd);
      }
      if (caught) caught.callId = callId;
    }

    if (caught) throw caught;
    const usage = sumUsage(usageParts.map(part => part.usage));
    const result = {
      data,
      callId,
      usage,
      costUsd: totalCost(),
      agentKey: agent.key,
      version: version.version,
      provider: adapter.name,
      model: usedFallback ? version.fallbackModel : version.model,
      usedFallback,
      repaired,
    };
    Object.defineProperty(result, EXECUTION_VERSION_ID, { value: version.id });
    return result;
  }

  return { execute };
}

const runner = createRunner();

module.exports = { ...runner, createRunner, repairPrompt, EXECUTION_VERSION_ID };
