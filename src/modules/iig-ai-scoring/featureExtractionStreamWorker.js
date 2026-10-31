const repository = require('./featureExtractionRepository');
const worker = require('./featureExtractionWorker');
const { createAiStageStreamWorker } = require('../event-delivery/aiStageStreamWorkerFactory');

module.exports = createAiStageStreamWorker({
  eventType: 'FEATURE_EXTRACTION_REQUESTED',
  group: 'iig-ai-feature-extraction-v1',
  logName: 'IigAiFeatureExtractionStream',
  enabledFlag: 'IIG_EVENT_AI_FEATURE_CONSUMER_ENABLED',
  pollingFlag: 'IIG_AI_FEATURE_WORKER_ENABLED',
  staleEnv: 'IIG_AI_FEATURE_STALE_MS',
  reclaimEnv: 'IIG_EVENT_AI_FEATURE_RECLAIM_MS',
  countEnv: 'IIG_EVENT_AI_FEATURE_COUNT',
  concurrencyEnv: 'IIG_EVENT_AI_FEATURE_CONCURRENCY',
  defaultStaleMs: 5 * 60 * 1000,
  defaultCount: 16,
  defaultConcurrency: 8,
  maxCount: 64,
  repository,
  worker,
});
