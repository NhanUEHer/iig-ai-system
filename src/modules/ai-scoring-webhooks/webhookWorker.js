const { createHmac, randomUUID } = require('node:crypto');
const repository = require('./webhookRepository');
const { decryptSecret } = require('./webhookSecret');
const { sendWebhook } = require('./safeWebhookClient');

const workerId = `webhook-delivery-${process.pid}-${randomUUID()}`;
let timer = null;
let running = false;

function signature(secret, timestamp, eventId, rawBody) {
  return `v1=${createHmac('sha256', secret).update(`${timestamp}.${eventId}.${rawBody}`).digest('hex')}`;
}

function safeResponseHeaders(headers = {}) {
  const allowed = ['content-type', 'date', 'retry-after', 'x-request-id'];
  return Object.fromEntries(allowed.filter(key => headers[key] !== undefined).map(key => [key, headers[key]]));
}

function safeRequestHeaders(headers = {}) {
  const allowed = ['content-type', 'user-agent', 'x-iig-event-id', 'x-iig-event-type', 'x-iig-timestamp'];
  return Object.fromEntries(allowed.filter(key => headers[key] !== undefined).map(key => [key, headers[key]]));
}

async function processDelivery(delivery, dependencies = {}) {
  const client = dependencies.client || sendWebhook;
  const taskRepository = dependencies.repository || repository;
  const rawBody = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const secret = decryptSecret({ ciphertext: delivery.endpoint.secretCiphertext, iv: delivery.endpoint.secretIv, tag: delivery.endpoint.secretTag });
  const headers = {
    'content-type': 'application/json', 'content-length': Buffer.byteLength(rawBody),
    'user-agent': 'IIG-AI-Scoring-Webhook/1.0', 'x-iig-event-id': delivery.eventId,
    'x-iig-event-type': delivery.eventType, 'x-iig-timestamp': timestamp,
    'x-iig-signature': signature(secret, timestamp, delivery.eventId, rawBody),
  };
  try {
    const response = await client({ url: delivery.endpoint.url, body: rawBody, headers, timeoutMs: 10_000 });
    const success = response.status >= 200 && response.status < 300;
    const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
    const result = await taskRepository.recordResult(delivery, {
      success, retryable, httpStatus: response.status, requestHeaders: safeRequestHeaders(headers),
      responseHeaders: safeResponseHeaders(response.headers), responseExcerpt: response.body,
      errorCode: success ? null : 'WEBHOOK_HTTP_ERROR', errorMessage: success ? null : `Webhook returned HTTP ${response.status}.`,
      latencyMs: response.latencyMs,
    });
    return { deliveryId: delivery.id, ...result };
  } catch (error) {
    const result = await taskRepository.recordResult(delivery, {
      success: false, retryable: true, requestHeaders: safeRequestHeaders(headers), errorCode: error.code || 'WEBHOOK_NETWORK_ERROR',
      errorMessage: error.message || 'Webhook request failed.',
    });
    return { deliveryId: delivery.id, ...result };
  }
}

async function runOnce(dependencies = {}) {
  const taskRepository = dependencies.repository || repository;
  const delivery = await taskRepository.claimNext(dependencies.workerId || workerId);
  return delivery ? processDelivery(delivery, { ...dependencies, repository: taskRepository }) : null;
}

async function runBatch(dependencies = {}) {
  if (running) return [];
  running = true;
  try { return await Promise.all(Array.from({ length: 4 }, () => runOnce(dependencies))); }
  finally { running = false; }
}

async function startWorker(dependencies = {}) {
  if (timer || String(process.env.AI_SCORING_WEBHOOK_WORKER_ENABLED || 'false') !== 'true') return timer;
  const taskRepository = dependencies.repository || repository;
  await taskRepository.recoverStale(5);
  timer = setInterval(() => runBatch({ ...dependencies, repository: taskRepository })
    .catch(error => console.error('[webhookWorker]', error.message)), 1000);
  timer.unref?.();
  await runBatch({ ...dependencies, repository: taskRepository });
  return timer;
}

function stopWorker() { if (timer) clearInterval(timer); timer = null; }

module.exports = { signature, safeRequestHeaders, safeResponseHeaders, processDelivery, runOnce, runBatch, startWorker, stopWorker };
