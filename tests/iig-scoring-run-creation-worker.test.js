const assert = require('node:assert/strict');
const test = require('node:test');

const worker = require('../src/modules/iig-ingestion/scoringRunCreationWorker');

const event = {
  id: '8a11ff0e-fb67-4dda-a4bc-adf3582f49bf',
  jobId: 'b3ec3a90-e447-4f88-b2e2-99ead7f32468',
  publishAttempts: 1,
  lockedBy: 'run-creation-1',
  payload: {
    submissionId: '01a111ba-2883-78ce-98dd-335a6c85fc54',
    groups: ['READ_TEXT_ALOUD', 'DESCRIBE_PICTURE'],
  },
};

test('durable run creation dispatches requested groups and completes the event', async () => {
  const calls = [];
  let completed;
  const result = await worker.processEvent(event, {
    repository: {
      beginPlan: async () => ({ id: 'plan-1', status: 'BUILDING' }),
      complete: async (_event, runs) => { completed = runs; },
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
    scoringRunService: {
      createReadAloudRun: async id => {
        calls.push(['rta', id]);
        return { run: { id: 'rta-run' }, replayed: false };
      },
      createDescribePictureRun: async id => {
        calls.push(['picture', id]);
        return { run: { id: 'picture-run' }, replayed: true };
      },
    },
  });
  assert.equal(result.status, 'completed');
  assert.equal(calls.length, 2);
  assert.deepEqual(completed, [
    { group: 'READ_TEXT_ALOUD', runId: 'rta-run', replayed: false },
    { group: 'DESCRIBE_PICTURE', runId: 'picture-run', replayed: true },
  ]);
});

test('run creation retries after partial idempotent dispatch failure', async () => {
  let retry;
  const result = await worker.processEvent(event, {
    repository: {
      beginPlan: async () => ({ id: 'plan-1', status: 'BUILDING' }),
      complete: async () => assert.fail('must not complete'),
      markRetry: async input => { retry = input; },
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
    scoringRunService: {
      createReadAloudRun: async () => ({ run: { id: 'rta-run' }, replayed: true }),
      createDescribePictureRun: async () => { throw new Error('database unavailable'); },
    },
  });
  assert.equal(result.status, 'retry');
  assert.equal(retry.delayMs, 5000);
});

test('durable run creation dispatches Writing Q1-Q5', async () => {
  const writingEvent = {
    ...event,
    payload: { ...event.payload, groups: ['WRITE_SENTENCE_Q1_Q5'] },
  };
  let completed;
  const result = await worker.processEvent(writingEvent, {
    repository: {
      beginPlan: async () => ({ id: 'plan-1', status: 'BUILDING' }),
      complete: async (_event, runs) => { completed = runs; },
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
    scoringRunService: {
      createWritingRun: async id => {
        assert.equal(id, writingEvent.payload.submissionId);
        return { run: { id: 'writing-run' }, replayed: false };
      },
    },
  });
  assert.equal(result.status, 'completed');
  assert.deepEqual(completed, [
    { group: 'WRITE_SENTENCE_Q1_Q5', runId: 'writing-run', replayed: false },
  ]);
});

test('durable run creation dispatches isolated Writing Q6-Q7 and Q8 runs', async () => {
  const writingEvent = {
    ...event,
    payload: {
      ...event.payload,
      groups: ['WRITTEN_REQUEST_Q6_Q7', 'OPINION_ESSAY_Q8'],
    },
  };
  let completed;
  const result = await worker.processEvent(writingEvent, {
    repository: {
      beginPlan: async () => ({ id: 'plan-1', status: 'BUILDING' }),
      complete: async (_event, runs) => { completed = runs; },
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
    scoringRunService: {
      createWrittenRequestRun: async () => ({
        run: { id: 'written-request-run' }, replayed: false,
      }),
      createOpinionEssayRun: async () => ({
        run: { id: 'opinion-essay-run' }, replayed: true,
      }),
    },
  });
  assert.equal(result.status, 'completed');
  assert.deepEqual(completed, [
    { group: 'WRITTEN_REQUEST_Q6_Q7', runId: 'written-request-run', replayed: false },
    { group: 'OPINION_ESSAY_Q8', runId: 'opinion-essay-run', replayed: true },
  ]);
});
