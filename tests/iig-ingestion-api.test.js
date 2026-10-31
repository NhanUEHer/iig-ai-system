const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const HttpError = require('../src/http/httpError');
const {
  validateCreateRequest,
  validateJobId,
} = require('../src/modules/iig-ingestion/scoringJobValidator');
const scoringJobService = require('../src/modules/iig-ingestion/scoringJobService');
const scoringJobRepository = require('../src/modules/iig-ingestion/scoringJobRepository');
const {
  createIigIntegrationAuth,
  createIigIntegrationRateLimit,
} = require('../src/middleware/iigIntegrationAuth');

test('IIG ingestion request validation normalizes the source identity', () => {
  assert.deepEqual(
    validateCreateRequest({
      keycode: ' nhy2wzxs ',
      scoringId: '01A10CBE-5139-7096-A3FA-705A31B65D0F',
    }, ' request-0001 '),
    {
      keycode: 'NHY2WZXS',
      scoringId: '01a10cbe-5139-7096-a3fa-705a31b65d0f',
      idempotencyKey: 'request-0001',
    }
  );
});

test('IIG ingestion rejects unknown fields and malformed identifiers', () => {
  assert.throws(
    () => validateCreateRequest({ keycode: 'NHY2WZXS', scoringId: 'bad', force: true }),
    error => error instanceof HttpError && error.code === 'REQUEST_BODY_INVALID'
  );
  assert.throws(
    () => validateCreateRequest({ keycode: 'bad!', scoringId: '01a10cbe-5139-7096-a3fa-705a31b65d0f' }),
    error => error.code === 'KEYCODE_INVALID'
  );
  assert.throws(() => validateJobId('bad'), error => error.code === 'SCORING_JOB_ID_INVALID');
});

test('scoring job service builds stable source and request identities', async () => {
  const calls = [];
  const repository = {
    createOrReuse: async input => {
      calls.push(input);
      return { job: { id: 'job-1' }, replayed: false };
    },
  };
  const service = new scoringJobService.ScoringJobService(repository);
  await service.create({
    keycode: 'NHY2WZXS',
    scoringId: '01a10cbe-5139-7096-a3fa-705a31b65d0f',
  }, { idempotencyKey: 'request-0001', tenantId: 'tenant-1' });

  assert.equal(calls[0].sourceKey, 'tenant-1:iig_elearning:NHY2WZXS:01a10cbe-5139-7096-a3fa-705a31b65d0f');
  assert.equal(calls[0].tenantId, 'tenant-1');
  assert.match(calls[0].requestHash, /^[0-9a-f]{64}$/);
  assert.equal(calls[0].idempotencyKey, 'request-0001');
});

test('scoring job service exposes repository identity conflicts as HTTP conflicts', async () => {
  const repository = {
    createOrReuse: async () => {
      const error = new Error('conflict');
      error.kind = 'IDEMPOTENCY_KEY_CONFLICT';
      throw error;
    },
  };
  const service = new scoringJobService.ScoringJobService(repository);
  await assert.rejects(
    () => service.create({
      keycode: 'NHY2WZXS',
      scoringId: '01a10cbe-5139-7096-a3fa-705a31b65d0f',
    }, { idempotencyKey: 'request-0001', tenantId: 'tenant-1' }),
    error => error instanceof HttpError && error.statusCode === 409 && error.code === 'IDEMPOTENCY_KEY_CONFLICT'
  );
});

test('scoring job repository commits the job, idempotency mapping and outbox together', async () => {
  const calls = [];
  const jobRow = {
    id: 'b3ec3a90-e447-4f88-b2e2-99ead7f32468',
    partner: 'IIG_ELEARNING',
    keycode: 'NHY2WZXS',
    source_scoring_id: '01a10cbe-5139-7096-a3fa-705a31b65d0f',
    source_key: 'iig_elearning:NHY2WZXS:01a10cbe-5139-7096-a3fa-705a31b65d0f',
    request_hash: 'a'.repeat(64),
    status: 'ACCEPTED',
    accepted_at: new Date('2026-10-09T08:00:00Z'),
    updated_at: new Date('2026-10-09T08:00:00Z'),
  };
  const responses = [
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [jobRow] },
    { rows: [{ id: 'idempotency-row' }] },
    { rows: [] },
  ];
  const database = {
    transaction: async work => work({
      query: async (sql, params) => {
        calls.push({ sql, params });
        return responses.shift();
      },
    }),
  };
  const repository = new scoringJobRepository.ScoringJobRepository(database);
  const result = await repository.createOrReuse({
    tenantId: 'tenant-1',
    partner: jobRow.partner,
    keycode: jobRow.keycode,
    scoringId: jobRow.source_scoring_id,
    sourceKey: jobRow.source_key,
    requestHash: jobRow.request_hash,
    idempotencyKey: 'request-0001',
  });

  assert.equal(result.replayed, false);
  assert.equal(result.job.id, jobRow.id);
  assert.equal(calls.length, 6);
  assert.match(calls[3].sql, /INSERT INTO iig_scoring_jobs/);
  assert.match(calls[4].sql, /INSERT INTO iig_scoring_job_idempotency_keys/);
  assert.match(calls[5].sql, /INSERT INTO iig_ingestion_outbox/);
  assert.equal(calls[5].params[1], `iig-scoring-job:${jobRow.id}:source-fetch:v1`);
});

test('scoring job repository returns an idempotent replay without publishing twice', async () => {
  const calls = [];
  const database = {
    transaction: async work => work({
      query: async (sql, params) => {
        calls.push({ sql, params });
        return { rows: [{
          id: 'b3ec3a90-e447-4f88-b2e2-99ead7f32468',
          partner: 'IIG_ELEARNING',
          keycode: 'NHY2WZXS',
          source_scoring_id: '01a10cbe-5139-7096-a3fa-705a31b65d0f',
          source_key: 'source-key',
          request_hash: 'a'.repeat(64),
          idempotency_request_hash: 'a'.repeat(64),
          status: 'ACCEPTED',
        }] };
      },
    }),
  };
  const repository = new scoringJobRepository.ScoringJobRepository(database);
  const result = await repository.createOrReuse({
    tenantId: 'tenant-1',
    partner: 'IIG_ELEARNING',
    keycode: 'NHY2WZXS',
    scoringId: '01a10cbe-5139-7096-a3fa-705a31b65d0f',
    sourceKey: 'source-key',
    requestHash: 'a'.repeat(64),
    idempotencyKey: 'request-0001',
  });
  assert.equal(result.replayed, true);
  assert.equal(calls.length, 1);
});

function request(authorization, ip = '127.0.0.1') {
  return {
    ip,
    get: name => name.toLowerCase() === 'authorization' ? authorization : undefined,
  };
}

test('IIG integration authentication uses bearer credentials and an IP allowlist', async () => {
  const middleware = createIigIntegrationAuth({
    apiKey: 'a-secure-integration-key-with-32-characters',
    ipAllowlist: '10.0.0.8',
    repository: { findActiveByHash: async () => null, touchLastUsed: async () => {} },
  });
  let result;
  await middleware(request('Bearer a-secure-integration-key-with-32-characters', '10.0.0.8'), {}, error => { result = error || 'ok'; });
  assert.equal(result, 'ok');

  await middleware(request('Bearer wrong', '10.0.0.8'), {}, error => { result = error; });
  assert.equal(result.code, 'INTEGRATION_AUTH_INVALID');

  await middleware(request('Bearer a-secure-integration-key-with-32-characters', '10.0.0.9'), {}, error => { result = error; });
  assert.equal(result.code, 'INTEGRATION_SOURCE_NOT_ALLOWED');
});

test('IIG integration rate limiter returns retry metadata', () => {
  let timestamp = 1_000;
  const middleware = createIigIntegrationRateLimit({ limit: 1, windowMs: 60_000, now: () => timestamp });
  const req = { ip: '10.0.0.8', integration: { partner: 'IIG_ELEARNING' } };
  const headers = {};
  const res = { setHeader: (name, value) => { headers[name] = value; } };
  let result;
  middleware(req, res, error => { result = error || 'ok'; });
  assert.equal(result, 'ok');
  middleware(req, res, error => { result = error; });
  assert.equal(result.code, 'INTEGRATION_RATE_LIMITED');
  assert.equal(headers['retry-after'], '60');

  timestamp += 60_001;
  middleware(req, res, error => { result = error || 'ok'; });
  assert.equal(result, 'ok');
});

test('IIG integration routes are mounted outside the admin JWT boundary', () => {
  const root = path.resolve(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
  const routes = fs.readFileSync(path.join(root, 'src/routes/iigIntegrationRoutes.js'), 'utf8');
  assert.match(app, /app\.use\('\/api\/integrations\/iig', iigIntegrationRoutes\)/);
  assert.ok(app.indexOf("app.use('/api/integrations/iig'") < app.indexOf("app.use('/api/submissions', authenticate"));
  assert.match(routes, /router\.post\('\/scoring-jobs'/);
  assert.match(routes, /router\.get\('\/scoring-jobs\/:jobId'/);
});
