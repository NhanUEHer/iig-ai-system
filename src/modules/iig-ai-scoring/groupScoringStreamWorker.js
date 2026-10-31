const { createAiRoutedStageStreamWorker } = require('../event-delivery/aiRoutedStageStreamWorkerFactory');
const routeRepository = require('../event-delivery/aiScoringRouteRepository');
const rtaRepository = require('./rtaGroupScoringRepository');
const rtaWorker = require('./rtaGroupScoringWorker');
const describeRepository = require('./describePictureGroupScoringRepository');
const describeWorker = require('./describePictureGroupScoringWorker');
const q5q10Repository = require('./q5Q10GroupScoringRepository');
const q5q10Worker = require('./q5Q10GroupScoringWorker');
const writingRepository = require('./writingQ1Q5GroupScoringRepository');
const writingWorker = require('./writingQ1Q5GroupScoringWorker');

module.exports = createAiRoutedStageStreamWorker({
  eventType: 'GROUP_SCORING_REQUESTED',
  group: 'iig-ai-group-scoring-router-v1',
  enabledFlag: 'IIG_EVENT_AI_GROUP_SCORING_CONSUMER_ENABLED',
  countEnv: 'IIG_EVENT_AI_GROUP_SCORING_COUNT',
  concurrencyEnv: 'IIG_EVENT_AI_GROUP_SCORING_CONCURRENCY',
  reclaimEnv: 'IIG_EVENT_AI_GROUP_SCORING_RECLAIM_MS',
  defaultStaleMs: 300_000,
  defaultCount: 3,
  defaultConcurrency: 3,
  logName: 'iig-ai-group-scoring-stream',
  unsupportedRouteCode: 'IIG_AI_GROUP_SCORING_ROUTE_UNSUPPORTED',
  routeRepository,
  resolveRoute: (repository, envelope) => repository.resolveGroupRoute({
    eventId: envelope.sourceOutboxId,
    runId: envelope.runId,
  }),
  routes: [
    {
      name: 'rta', repository: rtaRepository, worker: rtaWorker,
      pollingFlag: 'IIG_AI_RTA_GROUP_SCORING_WORKER_ENABLED',
      staleEnv: 'IIG_AI_RTA_GROUP_SCORING_STALE_MS', defaultStaleMs: 300_000,
      matches: version => String(version || '').startsWith('rta-q1-q2-'),
    },
    {
      name: 'describe-picture', repository: describeRepository, worker: describeWorker,
      pollingFlag: 'IIG_AI_DESCRIBE_PICTURE_GROUP_SCORING_WORKER_ENABLED',
      staleEnv: 'IIG_AI_DESCRIBE_PICTURE_GROUP_SCORING_STALE_MS', defaultStaleMs: 300_000,
      matches: version => String(version || '').startsWith('describe-picture-q3-q4-'),
    },
    {
      name: 'q5-q10', repository: q5q10Repository, worker: q5q10Worker,
      pollingFlag: 'IIG_AI_Q5_Q10_GROUP_SCORING_WORKER_ENABLED',
      staleEnv: 'IIG_AI_Q5_Q10_GROUP_SCORING_STALE_MS', defaultStaleMs: 300_000,
      matches: version => String(version || '').startsWith('respond-q5-q10-'),
    },
    {
      name: 'write-sentence-q1-q5', repository: writingRepository, worker: writingWorker,
      pollingFlag: 'IIG_AI_WRITE_SENTENCE_GROUP_SCORING_WORKER_ENABLED',
      staleEnv: 'IIG_AI_WRITE_SENTENCE_GROUP_SCORING_STALE_MS', defaultStaleMs: 300_000,
      matches: version => String(version || '').startsWith('write-sentence-q1-q5-'),
    },
  ],
});
