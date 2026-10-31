const repository = require('./mediaPreparationRepository');
const worker = require('./mediaPreparationWorker');
const { createIngestionStageStreamWorker } = require('../event-delivery/ingestionStageStreamWorkerFactory');

module.exports = createIngestionStageStreamWorker({
  eventType: 'MEDIA_PREPARATION_REQUESTED',
  group: 'iig-media-preparation-v1',
  logName: 'IigMediaPreparationStream',
  enabledFlag: 'IIG_EVENT_MEDIA_CONSUMER_ENABLED',
  pollingFlag: 'IIG_INGESTION_MEDIA_WORKER_ENABLED',
  staleEnv: 'IIG_INGESTION_MEDIA_STALE_MS',
  reclaimEnv: 'IIG_EVENT_MEDIA_RECLAIM_MS',
  countEnv: 'IIG_EVENT_MEDIA_COUNT',
  concurrencyEnv: 'IIG_EVENT_MEDIA_CONCURRENCY',
  defaultStaleMs: 15 * 60 * 1000,
  defaultCount: 5,
  defaultConcurrency: 2,
  repository,
  worker,
});
