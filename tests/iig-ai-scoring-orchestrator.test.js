const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repositoryModule = require('../src/modules/iig-ai-scoring/orchestratorRepository');
const worker = require('../src/modules/iig-ai-scoring/orchestratorWorker');

const RUN_ID = '41a111ba-2883-78ce-98dd-335a6c85fc54';
const QUESTION_RUN_ID = '51a111ba-2883-78ce-98dd-335a6c85fc54';
const ATTEMPT_ID = '61a111ba-2883-78ce-98dd-335a6c85fc54';
const MEDIA_ID = '71a111ba-2883-78ce-98dd-335a6c85fc54';
const TRANSCRIPTION_ID = '81a111ba-2883-78ce-98dd-335a6c85fc54';

function event(overrides = {}) {
  return {
    id: '91a111ba-2883-78ce-98dd-335a6c85fc54',
    runId: RUN_ID,
    eventType: 'AI_SCORING_REQUESTED',
    publishAttempts: 1,
    lockedBy: 'worker-1',
    ...overrides,
  };
}

const config = {
  sttConfig: {
    provider: 'GEMINI',
    modelName: 'gemini-answer-stt',
    modelVersion: 'test-v1',
    promptVersion: 'rta-answer-stt-v1',
  },
  rtaSttConfig: {
    provider: 'GEMINI',
    modelName: 'gemini-answer-stt',
    modelVersion: 'test-v1',
    promptVersion: 'rta-answer-stt-v1',
  },
  featureVersion: 'features-v1',
};

test('orchestrator claim uses skip-locked durable queue semantics', () => {
  const source = fs.readFileSync(path.join(
    __dirname,
    '../src/modules/iig-ai-scoring/orchestratorRepository.js'
  ), 'utf8');
  assert.match(source, /FOR UPDATE SKIP LOCKED/);
  assert.match(source, /event_type = 'AI_SCORING_REQUESTED'/);
  assert.match(source, /status IN \('PENDING', 'FAILED'\)/);
});

test('downstream deduplication keys stay within the database limit', () => {
  const key = repositoryModule.deduplicationKey(
    `iig-ai-question-run:${QUESTION_RUN_ID}:answer-stt`,
    {
      checksum: 'a'.repeat(64),
      modelVersion: 'm'.repeat(120),
      promptVersion: 'p'.repeat(80),
    }
  );
  assert.ok(key.length <= 240);
  assert.match(key, /^[a-z0-9:-]+$/i);
});

test('worker requires explicit STT model lineage before dispatch', () => {
  assert.throws(
    () => worker.resolveConfig({ sttModelName: '', sttModelVersion: '' }),
    error => error.code === 'IIG_AI_STT_CONFIG_MISSING' && error.retryable === false
  );
  const resolved = worker.resolveConfig({
    sttModelName: 'gemini-answer-stt',
    sttModelVersion: 'v1',
  });
  assert.equal(resolved.sttConfig.provider, 'DIFY');
  assert.equal(resolved.sttConfig.promptVersion, 'rta-answer-stt-v1');
  assert.equal(resolved.rtaSttConfig.provider, 'DIFY');
});

test('repository dispatches a speaking question to answer transcription', async () => {
  const calls = [];
  const responses = [
    { rows: [{ id: event().id }] },
    { rows: [{ id: RUN_ID, status: 'QUEUED' }] },
    { rows: [{
      question_run_id: QUESTION_RUN_ID,
      question_attempt_id: ATTEMPT_ID,
      scorer_type: 'READ_TEXT_ALOUD',
      media_asset_id: MEDIA_ID,
      checksum_sha256: 'a'.repeat(64),
      media_status: 'READY',
    }] },
    { rows: [{ id: TRANSCRIPTION_ID, status: 'PENDING' }] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
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
  const repository = new repositoryModule.OrchestratorRepository(database);
  const result = await repository.dispatchRun({ event: event(), ...config });
  assert.deepEqual(result, {
    dispatched: true,
    runStatus: 'TRANSCRIBING',
    transcriptionTasks: 1,
    featureTasks: 0,
    zeroScoringTasks: 0,
  });
  assert.equal(calls.filter(call => /INSERT INTO iig_ai_answer_transcriptions/.test(call.sql)).length, 1);
  const transcriptionInsert = calls.find(call => /INSERT INTO iig_ai_answer_transcriptions/.test(call.sql));
  assert.equal(transcriptionInsert.params[2], 'GEMINI');
  assert.equal(transcriptionInsert.params[3], 'gemini-answer-stt');
  assert.equal(calls.filter(call => /'ANSWER_TRANSCRIPTION_REQUESTED'/.test(call.sql)).length, 1);
  assert.equal(calls.filter(call => /SET status = \$2/.test(call.sql)).length, 1);
});

test('repository sends a business-zero speaking attempt directly to question scoring', async () => {
  const calls = [];
  const featureSetId = 'a1a111ba-2883-78ce-98dd-335a6c85fc54';
  const responses = [
    { rows: [{ id: event().id }] },
    { rows: [{ id: RUN_ID, status: 'QUEUED' }] },
    { rows: [{
      question_run_id: QUESTION_RUN_ID,
      question_attempt_id: ATTEMPT_ID,
      input_fingerprint: 'b'.repeat(64),
      ai_input: { businessZeroReason: 'NO_SPEECH' },
      scorer_type: 'READ_TEXT_ALOUD',
      media_asset_id: null,
      checksum_sha256: null,
      media_status: null,
    }] },
    { rows: [{ id: featureSetId }] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
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
  const repository = new repositoryModule.OrchestratorRepository(database);
  const result = await repository.dispatchRun({ event: event(), ...config });
  assert.equal(result.runStatus, 'SCORING_QUESTIONS');
  assert.equal(result.transcriptionTasks, 0);
  assert.equal(result.featureTasks, 0);
  assert.equal(result.zeroScoringTasks, 1);
  assert.equal(calls.some(call => /INSERT INTO iig_ai_answer_transcriptions/.test(call.sql)), false);
  assert.equal(calls.some(call => /'QUESTION_SCORING_REQUESTED'/.test(call.sql)), true);
  const scoringEvent = calls.find(call => /'QUESTION_SCORING_REQUESTED'/.test(call.sql));
  assert.equal(JSON.parse(scoringEvent.params[2]).upstreamZeroReason, 'NO_SPEECH');
});

test('repository dispatches a writing question directly to feature extraction', async () => {
  const calls = [];
  const responses = [
    { rows: [{ id: event().id }] },
    { rows: [{ id: RUN_ID, status: 'QUEUED' }] },
    { rows: [{
      question_run_id: QUESTION_RUN_ID,
      question_attempt_id: ATTEMPT_ID,
      scorer_type: 'WRITE_OPINION_ESSAY',
      media_asset_id: null,
      checksum_sha256: null,
      media_status: null,
    }] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
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
  const repository = new repositoryModule.OrchestratorRepository(database);
  const result = await repository.dispatchRun({ event: event(), ...config });
  assert.equal(result.runStatus, 'EXTRACTING_FEATURES');
  assert.equal(result.transcriptionTasks, 0);
  assert.equal(result.featureTasks, 1);
  assert.equal(calls.filter(call => /'FEATURE_EXTRACTION_REQUESTED'/.test(call.sql)).length, 1);
});

test('repository reuses a completed answer transcript and skips STT dispatch', async () => {
  const calls = [];
  const responses = [
    { rows: [{ id: event().id }] },
    { rows: [{ id: RUN_ID, status: 'QUEUED' }] },
    { rows: [{
      question_run_id: QUESTION_RUN_ID,
      question_attempt_id: ATTEMPT_ID,
      scorer_type: 'READ_TEXT_ALOUD',
      media_asset_id: MEDIA_ID,
      checksum_sha256: 'a'.repeat(64),
      media_status: 'READY',
    }] },
    { rows: [{ id: TRANSCRIPTION_ID, status: 'COMPLETED' }] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
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
  const repository = new repositoryModule.OrchestratorRepository(database);
  const result = await repository.dispatchRun({ event: event(), ...config });
  assert.equal(result.runStatus, 'EXTRACTING_FEATURES');
  assert.equal(result.transcriptionTasks, 0);
  assert.equal(result.featureTasks, 1);
  assert.equal(calls.filter(call => /'ANSWER_TRANSCRIPTION_REQUESTED'/.test(call.sql)).length, 0);
  assert.equal(calls.filter(call => /'FEATURE_EXTRACTION_REQUESTED'/.test(call.sql)).length, 1);
});

test('worker retries transient dispatch failures with exponential backoff', async () => {
  const calls = [];
  const result = await worker.processEvent(event({ publishAttempts: 2 }), {
    repository: {
      dispatchRun: async () => { throw Object.assign(new Error('temporary'), { code: 'TEMPORARY' }); },
      markRetry: async input => calls.push(input),
    },
    maxAttempts: 5,
    sttModelName: 'gemini-answer-stt',
    sttModelVersion: 'v1',
  });
  assert.equal(result.status, 'retry');
  assert.equal(result.delayMs, 10_000);
  assert.equal(calls.length, 1);
});

test('worker dead-letters permanent invariant failures', async () => {
  const calls = [];
  const result = await worker.processEvent(event(), {
    repository: {
      dispatchRun: async () => {
        throw Object.assign(new Error('missing audio'), {
          code: 'IIG_AI_STUDENT_AUDIO_NOT_READY', retryable: false,
        });
      },
      markDeadLetter: async input => calls.push(input),
    },
    sttModelName: 'gemini-answer-stt',
    sttModelVersion: 'v1',
  });
  assert.equal(result.status, 'dead_letter');
  assert.equal(result.code, 'IIG_AI_STUDENT_AUDIO_NOT_READY');
  assert.equal(calls.length, 1);
});

test('stale orchestrator leases are recoverable', async () => {
  const calls = [];
  const repository = new repositoryModule.OrchestratorRepository({
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ id: 'event-1' }], rowCount: 1 };
    },
  });
  assert.equal(await repository.recoverStale(30_000), 1);
  assert.match(calls[0].sql, /Worker lease expired/);
  assert.deepEqual(calls[0].params, [30_000]);
});
