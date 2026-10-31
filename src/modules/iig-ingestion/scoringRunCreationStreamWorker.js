const { createIngestionStageStreamWorker } = require('../event-delivery/ingestionStageStreamWorkerFactory');
const repository = require('./scoringRunCreationRepository');
const worker = require('./scoringRunCreationWorker');

module.exports = createIngestionStageStreamWorker({
  eventType: 'AI_SCORING_RUNS_REQUESTED',
  group: 'iig-ai-run-creation-v1',
  enabledFlag: 'IIG_EVENT_AI_RUN_CREATION_CONSUMER_ENABLED',
  pollingFlag: 'IIG_AI_RUN_CREATION_WORKER_ENABLED',
  countEnv: 'IIG_EVENT_AI_RUN_CREATION_COUNT',
  concurrencyEnv: 'IIG_EVENT_AI_RUN_CREATION_CONCURRENCY',
  reclaimEnv: 'IIG_EVENT_AI_RUN_CREATION_RECLAIM_MS',
  staleEnv: 'IIG_AI_RUN_CREATION_STALE_MS',
  defaultStaleMs: 300_000,
  defaultCount: 5,
  defaultConcurrency: 5,
  logName: 'iig-ai-run-creation-stream',
  repository,
  worker,
  onStart: ({ repository: businessRepository }) => {
    void businessRepository.reconcileSealedPlans()
      .then(summary => console.log(JSON.stringify({
        level: summary.failed ? 'warn' : 'info',
        event: 'scoring_plan_reconciliation_complete',
        ...summary,
      })))
      .catch(error => console.error(JSON.stringify({
        level: 'error',
        event: 'scoring_plan_reconciliation_failed',
        code: error.code || 'SCORING_PLAN_RECONCILIATION_FAILED',
        message: error.message,
      })));
  },
});
