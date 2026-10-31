const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  validateBatchDetail,
  payloadHash,
} = require('../src/modules/iig-ingestion/sourcePayloadValidator');
const worker = require('../src/modules/iig-ingestion/sourceFetchWorker');

const scoringId = '01a10cbe-5139-7096-a3fa-705a31b65d0f';
const job = {
  id: 'b3ec3a90-e447-4f88-b2e2-99ead7f32468',
  source_scoring_id: scoringId,
  keycode: 'NHY2WZXS',
};
const event = {
  id: '8a11ff0e-fb67-4dda-a4bc-adf3582f49bf',
  jobId: job.id,
  publishAttempts: 1,
  lockedBy: 'worker-1',
};

function sourcePayload(overrides = {}) {
  return [{
    mockTestScoringInfo: {
      id: scoringId,
      keyCode: 'NHY2WZXS',
      mockTestId: '01a0ad9e-5eaf-7000-9792-bc2e06a67be9',
    },
    groupScorings: [{ scoreScaleGroupName: 'Read text aloud', fromQuestion: 1, toQuestion: 2 }],
    questions: [{ questionId: 'question-1' }, { questionId: 'question-2' }],
    ...overrides,
  }];
}

test('batch detail validation verifies identity and returns a stable snapshot hash', () => {
  const first = validateBatchDetail(sourcePayload(), { scoringId, keycode: 'NHY2WZXS' });
  const reordered = sourcePayload();
  reordered[0] = {
    questions: reordered[0].questions,
    groupScorings: reordered[0].groupScorings,
    mockTestScoringInfo: reordered[0].mockTestScoringInfo,
  };
  assert.equal(first.questionCount, 2);
  assert.equal(first.mockTestId, '01a0ad9e-5eaf-7000-9792-bc2e06a67be9');
  assert.equal(first.payloadHash, payloadHash(reordered[0]));
});

test('batch detail validation blocks keycode mismatches before persistence', () => {
  assert.throws(
    () => validateBatchDetail(sourcePayload(), { scoringId, keycode: 'OTHER123' }),
    error => error.code === 'IIG_KEYCODE_MISMATCH' && error.retryable === false
  );
});

test('source fetch worker uses the cookie-authenticated admin proxy and completes the durable stage', async () => {
  const calls = [];
  const repository = {
    findJob: async () => job,
    markFetching: async () => { calls.push('fetching'); },
    completeFetch: async input => { calls.push(['complete', input.normalized.questionCount]); },
    markRetry: async () => { calls.push('retry'); },
    markDeadLetter: async () => { calls.push('dead'); },
  };
  const result = await worker.processEvent(event, {
    repository,
    iigClient: { fetchMocktestScoringBatchDetail: async id => {
      calls.push(['batch', id]);
      return sourcePayload();
    } },
  });
  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, [
    'fetching', ['batch', scoringId], ['complete', 2],
  ]);
});

test('source fetch worker retries transient upstream failures with exponential delay', async () => {
  let retry;
  const result = await worker.processEvent(event, {
    repository: {
      findJob: async () => job,
      markFetching: async () => {},
      markRetry: async input => { retry = input; },
      markDeadLetter: async () => assert.fail('must not dead-letter a transient first failure'),
    },
    iigClient: { fetchMocktestScoringBatchDetail: async () => {
      const error = new Error('busy');
      error.response = { status: 503 };
      throw error;
    } },
    maxAttempts: 5,
  });
  assert.equal(result.status, 'retry');
  assert.equal(result.code, 'IIG_HTTP_503');
  assert.equal(retry.delayMs, 5000);
});

test('source worker configuration rejects invalid and undersized numeric values', () => {
  assert.equal(worker.positiveInteger('5', 3), 5);
  assert.equal(worker.positiveInteger('not-a-number', 3), 3);
  assert.equal(worker.positiveInteger('10', 1000, 250), 1000);
});

test('source fetch worker dead-letters invalid source payloads', async () => {
  let deadLetter;
  const result = await worker.processEvent(event, {
    repository: {
      findJob: async () => job,
      markFetching: async () => {},
      markRetry: async () => assert.fail('invalid payload must not retry'),
      markDeadLetter: async input => { deadLetter = input; },
    },
    iigClient: { fetchMocktestScoringBatchDetail: async () => [] },
  });
  assert.equal(result.status, 'dead_letter');
  assert.equal(deadLetter.error.code, 'IIG_SCORING_NOT_FOUND');
});

test('source worker uses SKIP LOCKED and emits the canonical sync event', () => {
  const root = path.resolve(__dirname, '..');
  const repository = fs.readFileSync(path.join(root, 'src/modules/iig-ingestion/sourceFetchRepository.js'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'src/clients/iigClient.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
  assert.match(repository, /FOR UPDATE SKIP LOCKED/);
  assert.match(repository, /SOURCE_SYNC_REQUESTED/);
  assert.match(repository, /SOURCE_FETCH_REQUESTED/);
  assert.match(client, /admin-proxy\/mocktest-scorings\/batch-detail/);
  assert.match(server, /iigSourceFetchWorker\.startWorker/);
  assert.match(server, /iigSourceFetchWorker\.stopWorker/);
});
