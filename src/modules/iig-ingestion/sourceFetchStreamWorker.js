const { randomUUID } = require('node:crypto');
const streamClient = require('../event-delivery/redisStreamClient');
const streamConsumer = require('../event-delivery/redisStreamConsumer');
const inbox = require('../event-delivery/eventInboxRepository');
const sourceRepository = require('./sourceFetchRepository');
const sourceWorker = require('./sourceFetchWorker');
const publications = require('../event-delivery/outboxRelayRepository');
const { streamForQueue } = require('../event-delivery/eventContract');
const { mapWithConcurrency } = require('../event-delivery/boundedConcurrency');

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const STREAM = streamForQueue('INGESTION');
const GROUP = 'iig-source-fetch-v1';
const CONSUMER_NAME = `source-fetch-${process.pid}-${randomUUID()}`;

let running = false;
let client = null;
let loopPromise = null;

function integer(value, fallback, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= minimum ? Math.min(parsed, maximum) : fallback;
}

async function handleEnvelope(envelope, dependencies = {}) {
  const eventInbox = dependencies.inbox || inbox;
  const repository = dependencies.repository || sourceRepository;
  const worker = dependencies.worker || sourceWorker;
  const publicationRepository = dependencies.publications || publications;
  if (envelope.sourceQueue !== 'INGESTION' || envelope.eventType !== 'SOURCE_FETCH_REQUESTED') {
    return { status: 'ignored' };
  }
  const consumerName = dependencies.consumerName || GROUP;
  const inboxClaim = await eventInbox.claim({
    consumerName,
    eventId: envelope.eventId,
    eventType: envelope.eventType,
    staleMs: integer(process.env.IIG_EVENT_SOURCE_FETCH_RECLAIM_MS, 5 * 60 * 1000, 30_000),
  });
  if (!inboxClaim.claimed) {
    return inboxClaim.status === 'COMPLETED'
      ? { status: 'duplicate' }
      : { status: 'busy', ack: false };
  }

  try {
    const event = await repository.claimById(envelope.sourceOutboxId, consumerName);
    if (!event) {
      const source = await repository.findOutboxStatus(envelope.sourceOutboxId);
      if (source && ['PUBLISHED', 'DEAD_LETTER'].includes(source.status)) {
        await eventInbox.complete({ consumerName, eventId: envelope.eventId, result: { sourceStatus: source.status } });
        return { status: 'already_terminal' };
      }
      const error = Object.assign(new Error('Source-fetch outbox event is not claimable yet.'), {
        code: 'SOURCE_EVENT_NOT_CLAIMABLE', retryable: true,
      });
      await eventInbox.fail({ consumerName, eventId: envelope.eventId, error });
      return { status: 'retry', ack: false, code: error.code };
    }

    const result = await worker.processEvent(event, { ...dependencies, repository });
    if (result.status === 'retry') {
      const error = Object.assign(new Error('Source fetch scheduled a retry.'), {
        code: result.code || 'SOURCE_FETCH_RETRY', retryable: true,
      });
      const scheduled = await publicationRepository.scheduleRepublish({
        sourceQueue: 'INGESTION', sourceOutboxId: envelope.sourceOutboxId,
        delayMs: result.delayMs || 1000, error,
      });
      if (!scheduled) throw Object.assign(new Error('Retry publication could not be scheduled.'), {
        code: 'EVENT_REPUBLISH_SCHEDULE_FAILED', retryable: true,
      });
      await eventInbox.fail({ consumerName, eventId: envelope.eventId, error });
      return { ...result, republishScheduled: true };
    }
    await eventInbox.complete({ consumerName, eventId: envelope.eventId, result });
    return result;
  } catch (error) {
    await eventInbox.fail({ consumerName, eventId: envelope.eventId, error });
    throw error;
  }
}

async function consumeLoop(dependencies = {}) {
  const redis = dependencies.client || client;
  const configuredCount = integer(process.env.IIG_EVENT_SOURCE_FETCH_COUNT, 5, 1, 16);
  const concurrency = integer(process.env.IIG_EVENT_SOURCE_FETCH_CONCURRENCY, 5, 1, 16);
  const count = Math.max(configuredCount, concurrency);
  const blockMs = integer(process.env.IIG_EVENT_SOURCE_FETCH_BLOCK_MS, 1000, 100, 5000);
  const minIdleMs = integer(process.env.IIG_EVENT_SOURCE_FETCH_RECLAIM_MS, 5 * 60 * 1000, 30_000);
  const options = {
    stream: STREAM,
    group: GROUP,
    consumer: dependencies.redisConsumerName || CONSUMER_NAME,
    count,
    blockMs,
    minIdleMs,
    handler: envelope => handleEnvelope(envelope, dependencies),
    onPermanentError: error => console.error('[IigSourceFetchStream]', error.message),
    onTransientError: error => console.error('[IigSourceFetchStream]', error.message),
  };
  const cleanupIntervalMs = integer(process.env.IIG_EVENT_CONSUMER_CLEANUP_INTERVAL_MS, 300_000, 60_000);
  options.staleConsumerMs = integer(process.env.IIG_EVENT_CONSUMER_STALE_MS, 3_600_000, cleanupIntervalMs);
  let nextConsumerCleanupAt = 0;
  while (running) {
    try {
      if (Date.now() >= nextConsumerCleanupAt) {
        const deleted = await streamConsumer.cleanupStaleConsumers(redis, options);
        if (deleted.length) console.log(JSON.stringify({
          level: 'info', event: 'redis_stream_consumers_cleaned', group: GROUP, count: deleted.length,
        }));
        nextConsumerCleanupAt = Date.now() + cleanupIntervalMs;
      }
      const reclaimed = await streamConsumer.reclaimStale(redis, options);
      await mapWithConcurrency(reclaimed, concurrency, entry => (
        streamConsumer.processEntry(redis, options, entry)
      ));
      const entries = await streamConsumer.readNew(redis, options);
      await mapWithConcurrency(entries, concurrency, entry => (
        streamConsumer.processEntry(redis, options, entry)
      ));
    } catch (error) {
      if (!running) break;
      console.error('[IigSourceFetchStream]', error.message);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function startWorker(dependencies = {}) {
  const enabled = TRUE_VALUES.has(String(process.env.IIG_EVENT_SOURCE_FETCH_CONSUMER_ENABLED || 'false').trim().toLowerCase());
  if (!enabled || running) return loopPromise;
  const pollingEnabled = TRUE_VALUES.has(String(process.env.IIG_INGESTION_SOURCE_WORKER_ENABLED || 'false').trim().toLowerCase());
  if (pollingEnabled) throw new Error('Source-fetch polling worker and stream consumer cannot both be enabled.');
  client = dependencies.client || await streamClient.createConnectedClient();
  try {
    await streamConsumer.ensureGroup(client, { stream: STREAM, group: GROUP });
    await (dependencies.repository || sourceRepository).recoverStale(
      integer(process.env.IIG_INGESTION_SOURCE_STALE_MS, 5 * 60 * 1000, 30_000)
    );
    running = true;
    loopPromise = consumeLoop({ ...dependencies, client });
    return { stream: STREAM, group: GROUP };
  } catch (error) {
    await client.quit?.().catch(() => undefined);
    client = null;
    throw error;
  }
}

function stopWorker() {
  running = false;
  if (client && client !== undefined) void client.quit?.().catch(() => undefined);
  client = null;
  loopPromise = null;
}

module.exports = { integer, handleEnvelope, consumeLoop, startWorker, stopWorker, STREAM, GROUP };
