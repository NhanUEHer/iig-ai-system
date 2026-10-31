const { createAiRoutedStageStreamWorker } = require('../event-delivery/aiRoutedStageStreamWorkerFactory');
const routeRepository = require('../event-delivery/aiScoringRouteRepository');
const rtaRepository = require('./rtaQuestionScoringRepository');
const rtaWorker = require('./rtaQuestionScoringWorker');
const describeRepository = require('./describePictureQuestionScoringRepository');
const describeWorker = require('./describePictureQuestionScoringWorker');
const extendedRepository = require('./extendedSpeakingQuestionScoringRepository');
const extendedWorker = require('./extendedSpeakingQuestionScoringWorker');
const opinionRepository = require('./expressOpinionQuestionScoringRepository');
const opinionWorker = require('./expressOpinionQuestionScoringWorker');
const writingRepository = require('./writingQuestionScoringRepository');
const writingWorker = require('./writingQuestionScoringWorker');
const extendedWritingRepository = require('./extendedWritingQuestionScoringRepository');
const extendedWritingWorker = require('./extendedWritingQuestionScoringWorker');

module.exports = createAiRoutedStageStreamWorker({
  eventType: 'QUESTION_SCORING_REQUESTED',
  group: 'iig-ai-question-scoring-router-v1',
  enabledFlag: 'IIG_EVENT_AI_QUESTION_SCORING_CONSUMER_ENABLED',
  countEnv: 'IIG_EVENT_AI_QUESTION_SCORING_COUNT',
  concurrencyEnv: 'IIG_EVENT_AI_QUESTION_SCORING_CONCURRENCY',
  reclaimEnv: 'IIG_EVENT_AI_QUESTION_SCORING_RECLAIM_MS',
  defaultStaleMs: 300_000,
  defaultCount: 19,
  defaultConcurrency: 6,
  maxCount: 32,
  maxConcurrency: 19,
  logName: 'iig-ai-question-scoring-stream',
  unsupportedRouteCode: 'IIG_AI_QUESTION_SCORING_ROUTE_UNSUPPORTED',
  routeRepository,
  resolveRoute: (repository, envelope) => repository.resolveQuestionRoute({
    eventId: envelope.sourceOutboxId,
    runId: envelope.runId,
  }),
  routes: [
    {
      name: 'rta', repository: rtaRepository, worker: rtaWorker,
      pollingFlag: 'IIG_AI_RTA_SCORING_WORKER_ENABLED',
      staleEnv: 'IIG_AI_RTA_SCORING_STALE_MS', defaultStaleMs: 300_000,
      matches: route => route?.scorerType === 'READ_TEXT_ALOUD',
    },
    {
      name: 'describe-picture', repository: describeRepository, worker: describeWorker,
      pollingFlag: 'IIG_AI_DESCRIBE_PICTURE_SCORING_WORKER_ENABLED',
      staleEnv: 'IIG_AI_DESCRIBE_PICTURE_SCORING_STALE_MS', defaultStaleMs: 300_000,
      matches: route => route?.scorerType === 'DESCRIBE_PICTURE',
    },
    {
      name: 'extended-speaking', repository: extendedRepository, worker: extendedWorker,
      pollingFlag: 'IIG_AI_EXTENDED_SPEAKING_SCORING_WORKER_ENABLED',
      staleEnv: 'IIG_AI_EXTENDED_SPEAKING_SCORING_STALE_MS', defaultStaleMs: 300_000,
      matches: route => ['RESPOND_TO_QUESTIONS', 'RESPOND_USING_INFORMATION'].includes(route?.scorerType),
    },
    {
      name: 'express-opinion', repository: opinionRepository, worker: opinionWorker,
      pollingFlag: 'IIG_AI_EXPRESS_OPINION_SCORING_WORKER_ENABLED',
      staleEnv: 'IIG_AI_EXPRESS_OPINION_SCORING_STALE_MS', defaultStaleMs: 300_000,
      matches: route => route?.scorerType === 'EXPRESS_AN_OPINION' && route.questionNumber === 11,
    },
    {
      name: 'write-sentence-picture', repository: writingRepository, worker: writingWorker,
      pollingFlag: 'IIG_AI_WRITE_SENTENCE_PICTURE_SCORING_WORKER_ENABLED',
      staleEnv: 'IIG_AI_WRITE_SENTENCE_PICTURE_SCORING_STALE_MS', defaultStaleMs: 300_000,
      matches: route => route?.scorerType === 'WRITE_SENTENCE_PICTURE',
    },
    {
      name: 'extended-writing', repository: extendedWritingRepository, worker: extendedWritingWorker,
      pollingFlag: 'IIG_AI_EXTENDED_WRITING_SCORING_WORKER_ENABLED',
      staleEnv: 'IIG_AI_EXTENDED_WRITING_SCORING_STALE_MS', defaultStaleMs: 300_000,
      matches: route => ['RESPOND_TO_WRITTEN_REQUEST', 'WRITE_OPINION_ESSAY'].includes(route?.scorerType),
    },
  ],
});
