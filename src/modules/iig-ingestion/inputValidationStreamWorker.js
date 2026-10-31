const repository = require('./inputValidationRepository');
const worker = require('./inputValidationWorker');
const { createIngestionStageStreamWorker } = require('../event-delivery/ingestionStageStreamWorkerFactory');

module.exports = createIngestionStageStreamWorker({
  eventType: 'INPUT_VALIDATION_REQUESTED',
  group: 'iig-input-validation-v1',
  logName: 'IigInputValidationStream',
  enabledFlag: 'IIG_EVENT_INPUT_VALIDATION_CONSUMER_ENABLED',
  pollingFlag: 'IIG_INGESTION_VALIDATION_WORKER_ENABLED',
  staleEnv: 'IIG_INGESTION_VALIDATION_STALE_MS',
  reclaimEnv: 'IIG_EVENT_INPUT_VALIDATION_RECLAIM_MS',
  countEnv: 'IIG_EVENT_INPUT_VALIDATION_COUNT',
  concurrencyEnv: 'IIG_EVENT_INPUT_VALIDATION_CONCURRENCY',
  defaultStaleMs: 5 * 60 * 1000,
  defaultCount: 5,
  defaultConcurrency: 5,
  repository,
  worker,
  onStart: async ({ repository: validationRepository }) => {
    await validationRepository.enqueueResolutionReconciliation?.();
  },
});
