const repository = require('./answerTranscriptionRepository');
const worker = require('./answerTranscriptionWorker');
const { createAiStageStreamWorker } = require('../event-delivery/aiStageStreamWorkerFactory');

module.exports = createAiStageStreamWorker({
  eventType: 'ANSWER_TRANSCRIPTION_REQUESTED',
  group: 'iig-ai-answer-stt-v1',
  logName: 'IigAiAnswerSttStream',
  enabledFlag: 'IIG_EVENT_AI_ANSWER_STT_CONSUMER_ENABLED',
  pollingFlag: 'IIG_AI_ANSWER_STT_WORKER_ENABLED',
  staleEnv: 'IIG_AI_ANSWER_STT_STALE_MS',
  reclaimEnv: 'IIG_EVENT_AI_ANSWER_STT_RECLAIM_MS',
  countEnv: 'IIG_EVENT_AI_ANSWER_STT_COUNT',
  concurrencyEnv: 'IIG_EVENT_AI_ANSWER_STT_CONCURRENCY',
  defaultStaleMs: 5 * 60 * 1000,
  defaultCount: 11,
  defaultConcurrency: 6,
  maxCount: 32,
  repository,
  worker,
});
