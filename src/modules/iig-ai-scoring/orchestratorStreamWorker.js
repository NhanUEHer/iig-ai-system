const repository = require('./orchestratorRepository');
const worker = require('./orchestratorWorker');
const { createAiStageStreamWorker } = require('../event-delivery/aiStageStreamWorkerFactory');

module.exports = createAiStageStreamWorker({
  eventType: 'AI_SCORING_REQUESTED',
  group: 'iig-ai-orchestrator-v1',
  logName: 'IigAiOrchestratorStream',
  enabledFlag: 'IIG_EVENT_AI_ORCHESTRATOR_CONSUMER_ENABLED',
  pollingFlag: 'IIG_AI_ORCHESTRATOR_WORKER_ENABLED',
  staleEnv: 'IIG_AI_ORCHESTRATOR_STALE_MS',
  reclaimEnv: 'IIG_EVENT_AI_ORCHESTRATOR_RECLAIM_MS',
  countEnv: 'IIG_EVENT_AI_ORCHESTRATOR_COUNT',
  concurrencyEnv: 'IIG_EVENT_AI_ORCHESTRATOR_CONCURRENCY',
  defaultStaleMs: 5 * 60 * 1000,
  defaultCount: 5,
  defaultConcurrency: 5,
  repository,
  worker,
});
