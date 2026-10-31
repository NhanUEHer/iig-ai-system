const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHmac } = require('node:crypto');

const validator = require('../src/modules/ai-scoring-webhooks/webhookValidator');
const secret = require('../src/modules/ai-scoring-webhooks/webhookSecret');
const worker = require('../src/modules/ai-scoring-webhooks/webhookWorker');
const projector = require('../src/modules/ai-scoring-webhooks/webhookPayloadProjector');

test('completed webhook projects the full versioned scoring result contract', () => {
  const payload = projector.buildPayload({
    eventId: 'event-1', occurredAt: '2026-10-29T09:11:06.276Z', tenantCode: 'IIG_VIETNAM',
    job: { id: 'job-1', scoringId: 'scoring-1', keycode: '1WXCU0H0' },
    groups: [{ sourceGroupId: 'S_Q1_Q2', sourceQuestionIds: ['s_q1', 's_q2'], score: '2.00' }],
    questions: [{
      sourceQuestionId: 's_q1', sourceText: 'Candidate answer', transcript: 'Candidate answer',
      output: { comment: { text: 'Good delivery.' }, errors: [{ error_type: 'PRONUNCIATION', severity: 'high', evidence: ['answer'], message_vi: 'Cần phát âm rõ hơn.' }] },
    }],
  });
  assert.equal(payload.schemaVersion, 'webhook-scoring-result-v1');
  assert.equal(payload.eventType, 'scoring.completed');
  assert.deepEqual(payload.data.scores[0], { groupId: 'S_Q1_Q2', appliedQuestionIds: ['s_q1', 's_q2'], score: 2 });
  assert.equal(payload.data.details[0].questionId, 's_q1');
  assert.equal(payload.data.details[0].comment, 'Good delivery.');
  assert.deepEqual(payload.data.details[0].errors[0].span, { start: 10, end: 16, text: 'answer' });
});

test('webhook migration encrypts secrets and keeps durable delivery lineage', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../src/database/migrations/130_ai_scoring_webhooks.sql'), 'utf8');
  assert.match(sql, /secret_ciphertext TEXT NOT NULL/);
  assert.match(sql, /integration_webhook_deliveries/);
  assert.match(sql, /replay_of_id UUID/);
  assert.doesNotMatch(sql, /secret\s+TEXT NOT NULL/);
  const repository = fs.readFileSync(path.join(__dirname, '../src/modules/ai-scoring-webhooks/webhookRepository.js'), 'utf8');
  assert.match(repository, /FOR UPDATE OF delivery SKIP LOCKED/);
});

test('webhook URL validation accepts public HTTPS and rejects unsafe targets', async () => {
  const publicResolver = { lookup: async () => [{ address: '93.184.216.34', family: 4 }] };
  const result = await validator.resolveSafeUrl('https://example.com/hooks', publicResolver);
  assert.equal(result.url.hostname, 'example.com');
  await assert.rejects(() => validator.resolveSafeUrl('http://example.com/hooks', publicResolver), error => error.code === 'WEBHOOK_VALIDATION_FAILED');
  await assert.rejects(() => validator.resolveSafeUrl('https://localhost/hooks', publicResolver), error => error.code === 'WEBHOOK_VALIDATION_FAILED');
  await assert.rejects(() => validator.resolveSafeUrl('https://internal.example/hooks', { lookup: async () => [{ address: '10.0.0.4', family: 4 }] }), error => error.code === 'WEBHOOK_VALIDATION_FAILED');
});

test('webhook endpoint validator bounds events', async () => {
  const resolver = { lookup: async () => [{ address: '93.184.216.34', family: 4 }] };
  const input = await validator.endpointInput({ name: 'Production', url: 'https://example.com/hook', eventTypes: ['scoring.completed'] }, { resolver });
  assert.deepEqual(input.eventTypes, ['scoring.completed']);
  await assert.rejects(() => validator.endpointInput({ name: 'Production', url: 'https://example.com/hook', eventTypes: ['unknown'] }, { resolver }), error => error.details?.field === 'eventTypes');
});

test('signing secret round trips through AES-GCM and is never stored as plaintext', () => {
  const env = { NODE_ENV: 'test', WEBHOOK_SECRET_ENCRYPTION_KEY: 'test-key' };
  const raw = secret.generateSecret();
  const encrypted = secret.encryptSecret(raw, env);
  assert.notEqual(encrypted.ciphertext, raw);
  assert.equal(secret.decryptSecret(encrypted, env), raw);
});

test('webhook HMAC signature is stable for raw body, timestamp and event id', () => {
  const raw = '{"ok":true}';
  const expected = createHmac('sha256', 'secret').update(`123.event-1.${raw}`).digest('hex');
  assert.equal(worker.signature('secret', '123', 'event-1', raw), `v1=${expected}`);
});

test('webhook worker retries technical failures without mutating the event', async () => {
  const rawSecret = secret.generateSecret();
  const encrypted = secret.encryptSecret(rawSecret);
  const delivery = {
    id: 'delivery-1', eventId: 'event-1', eventType: 'scoring.completed', payload: { id: 'event-1' },
    attemptCount: 1, maxAttempts: 5, endpointId: 'endpoint-1',
    endpoint: { url: 'https://example.com/hook', secretCiphertext: encrypted.ciphertext, secretIv: encrypted.iv, secretTag: encrypted.tag },
  };
  let recorded;
  const repository = { recordResult: async (_delivery, result) => { recorded = result; return { status: 'RETRY', delaySeconds: 5 }; } };
  const result = await worker.processDelivery(delivery, {
    repository,
    client: async ({ body, headers }) => {
      assert.equal(body, JSON.stringify(delivery.payload));
      assert.equal(headers['x-iig-event-id'], delivery.eventId);
      return { status: 503, headers: {}, body: 'unavailable', latencyMs: 12 };
    },
  });
  assert.equal(result.status, 'RETRY');
  assert.equal(recorded.retryable, true);
  assert.equal(recorded.httpStatus, 503);
  assert.equal(recorded.requestHeaders['x-iig-signature'], undefined);
});

test('webhook worker does not retry ordinary 4xx responses', async () => {
  const rawSecret = secret.generateSecret();
  const encrypted = secret.encryptSecret(rawSecret);
  let recorded;
  await worker.processDelivery({
    id: 'delivery-2', eventId: 'event-2', eventType: 'scoring.failed', payload: { id: 'event-2' },
    attemptCount: 1, maxAttempts: 5, endpointId: 'endpoint-1',
    endpoint: { url: 'https://example.com/hook', secretCiphertext: encrypted.ciphertext, secretIv: encrypted.iv, secretTag: encrypted.tag },
  }, {
    repository: { recordResult: async (_delivery, result) => { recorded = result; return { status: 'DEAD_LETTER' }; } },
    client: async () => ({ status: 400, headers: {}, body: 'bad request', latencyMs: 4 }),
  });
  assert.equal(recorded.retryable, false);
});

test('terminal webhook event insert is idempotent and credential-scoped', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/ai-scoring-webhooks/webhookEventRepository.js'), 'utf8');
  assert.match(source, /JOIN integration_api_credentials credential ON credential\.id=job\.credential_id/);
  assert.match(source, /webhookPayloadProjector/);
  assert.match(source, /iig_ai_group_results/);
  assert.match(source, /iig_ai_question_runs/);
  assert.match(source, /endpoint\.event_types \? \$2/);
  assert.match(source, /ON CONFLICT DO NOTHING/);
  const migration = fs.readFileSync(path.join(__dirname, '../src/database/migrations/131_ai_scoring_webhook_delivery_dedup.sql'), 'utf8');
  assert.match(migration, /endpoint_id, job_id, event_type/);
  const failedMigration = fs.readFileSync(path.join(__dirname, '../src/database/migrations/132_ai_scoring_webhook_failed_job_events.sql'), 'utf8');
  assert.match(failedMigration, /NEW\.credential_id IS NOT NULL/);
  assert.match(failedMigration, /'scoring\.failed'/);
  assert.match(failedMigration, /ON CONFLICT DO NOTHING/);
});

test('replay rebuilds completed scoring payload instead of copying a legacy summary', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/ai-scoring-webhooks/webhookRepository.js'), 'utf8');
  assert.match(source, /webhookEventRepository\.loadCompletedResult/);
  assert.match(source, /buildPayload/);
  assert.match(source, /JSON\.stringify\(payload\)/);
});
