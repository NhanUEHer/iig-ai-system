const repository = require('./sourceSyncRepository');
const worker = require('./sourceSyncWorker');
const { createIngestionStageStreamWorker } = require('../event-delivery/ingestionStageStreamWorkerFactory');

module.exports = createIngestionStageStreamWorker({
  eventType: 'SOURCE_SYNC_REQUESTED',
  group: 'iig-source-sync-v1',
  logName: 'IigSourceSyncStream',
  enabledFlag: 'IIG_EVENT_SOURCE_SYNC_CONSUMER_ENABLED',
  pollingFlag: 'IIG_INGESTION_SYNC_WORKER_ENABLED',
  staleEnv: 'IIG_INGESTION_SYNC_STALE_MS',
  reclaimEnv: 'IIG_EVENT_SOURCE_SYNC_RECLAIM_MS',
  countEnv: 'IIG_EVENT_SOURCE_SYNC_COUNT',
  concurrencyEnv: 'IIG_EVENT_SOURCE_SYNC_CONCURRENCY',
  defaultStaleMs: 5 * 60 * 1000,
  defaultCount: 5,
  defaultConcurrency: 5,
  repository,
  worker,
});
