const repository = require('./questionTranscriptionRepository');
const worker = require('./questionTranscriptionWorker');
const { createIngestionStageStreamWorker } = require('../event-delivery/ingestionStageStreamWorkerFactory');

module.exports = createIngestionStageStreamWorker({
  eventType: 'QUESTION_TRANSCRIPTION_REQUESTED',
  group: 'iig-question-transcription-v1',
  logName: 'IigQuestionTranscriptionStream',
  enabledFlag: 'IIG_EVENT_QUESTION_STT_CONSUMER_ENABLED',
  pollingFlag: 'IIG_INGESTION_QUESTION_STT_WORKER_ENABLED',
  staleEnv: 'IIG_INGESTION_QUESTION_STT_STALE_MS',
  reclaimEnv: 'IIG_EVENT_QUESTION_STT_RECLAIM_MS',
  countEnv: 'IIG_EVENT_QUESTION_STT_COUNT',
  concurrencyEnv: 'IIG_EVENT_QUESTION_STT_CONCURRENCY',
  defaultStaleMs: 10 * 60 * 1000,
  defaultCount: 5,
  defaultConcurrency: 3,
  repository,
  worker,
});
