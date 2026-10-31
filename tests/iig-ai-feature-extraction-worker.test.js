const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const worker = require('../src/modules/iig-ai-scoring/featureExtractionWorker');
const { extractFeatures } = require('../src/modules/iig-ai-scoring/featureExtractor');

const RUN_ID = '11a111ba-2883-78ce-98dd-335a6c85fc54';
const QUESTION_RUN_ID = '21a111ba-2883-78ce-98dd-335a6c85fc54';
const ATTEMPT_ID = '31a111ba-2883-78ce-98dd-335a6c85fc54';
const TRANSCRIPTION_ID = '41a111ba-2883-78ce-98dd-335a6c85fc54';
const FEATURE_SET_ID = '51a111ba-2883-78ce-98dd-335a6c85fc54';

function event(overrides = {}) {
  return {
    id: '61a111ba-2883-78ce-98dd-335a6c85fc54',
    runId: RUN_ID,
    eventType: 'FEATURE_EXTRACTION_REQUESTED',
    payload: {
      scoringRunId: RUN_ID,
      questionRunId: QUESTION_RUN_ID,
      questionAttemptId: ATTEMPT_ID,
      transcriptionId: TRANSCRIPTION_ID,
      featureVersion: 'iig-ai-evidence-v1',
    },
    publishAttempts: 1,
    lockedBy: 'feature-worker-1',
    ...overrides,
  };
}

function task(scorerType = 'READ_TEXT_ALOUD', overrides = {}) {
  return {
    runId: RUN_ID,
    questionRunId: QUESTION_RUN_ID,
    questionAttemptId: ATTEMPT_ID,
    questionRunStatus: 'EXTRACTING_FEATURES',
    scorerType,
    transcriptionId: scorerType.startsWith('WRITE_') ? null : TRANSCRIPTION_ID,
    transcriptionStatus: scorerType.startsWith('WRITE_') ? null : 'COMPLETED',
    transcript: scorerType.startsWith('WRITE_') ? null : 'Good evening everyone.',
    aiInput: {
      question: {
        scorerType,
        questionText: scorerType === 'RESPOND_TO_QUESTIONS' ? 'When does the class begin?' : null,
        promptText: 'Respond clearly.',
        contextText: scorerType === 'READ_TEXT_ALOUD' ? 'Good evening everyone.' : 'Class schedule.',
      },
      response: scorerType.startsWith('WRITE_')
        ? { type: 'text', text: 'I recommend extending the opening hours.' }
        : {
            type: 'audio',
            audio: {
              durationSeconds: 10,
              checksumSha256: 'a'.repeat(64),
              quality: { silenceRatio: 0.1, meanVolumeDb: -20 },
            },
          },
    },
    ...overrides,
  };
}

function dependencies(loadedTask = task()) {
  const calls = [];
  return {
    calls,
    values: {
      featureVersion: 'iig-ai-evidence-v1',
      repository: {
        loadTask: async () => loadedTask,
        completeTask: async input => {
          calls.push(input);
          return {
            completed: true,
            featureSetId: FEATURE_SET_ID,
            pendingStages: input.extracted.features.completion.taskSemantic === 'PENDING'
              ? ['SPEECH_EVIDENCE', 'TASK_EVIDENCE']
              : input.extracted.features.completion.speech === 'PENDING'
                ? ['SPEECH_EVIDENCE']
                : [],
          };
        },
        markRetry: async input => calls.push({ retry: input }),
        markDeadLetter: async input => calls.push({ deadLetter: input }),
      },
    },
  };
}

test('feature repository persists reusable features and fans out durable evidence jobs', () => {
  const source = fs.readFileSync(path.join(
    __dirname,
    '../src/modules/iig-ai-scoring/featureExtractionRepository.js'
  ), 'utf8');
  assert.match(source, /event_type = 'FEATURE_EXTRACTION_REQUESTED'/);
  assert.match(source, /FOR UPDATE SKIP LOCKED/);
  assert.match(source, /INSERT INTO iig_ai_feature_sets/);
  assert.match(source, /'SPEECH_EVIDENCE_REQUESTED'/);
  assert.match(source, /'TASK_EVIDENCE_REQUESTED'/);
  assert.match(source, /evidenceContractVersion/);
  assert.equal((source.match(/evidenceContractVersion/g) || []).length, 2);
  assert.match(source, /ON CONFLICT \(deduplication_key\) DO NOTHING/);
});

test('RTA common extraction routes directly to Dify scoring without Azure evidence', async () => {
  const deps = dependencies();
  const output = await worker.processEvent(event(), deps.values);
  assert.equal(output.status, 'completed');
  assert.deepEqual(output.pendingStages, []);
  const persisted = deps.calls[0].extracted.features;
  assert.equal(persisted.task.profile, 'READ_ALOUD');
  assert.ok(persisted.task.deterministic.rtaAlignment);
  assert.equal(persisted.completion.taskSemantic, 'NOT_REQUIRED');
});

test('Q5-Q10 extraction routes directly to the dedicated progressive Dify flow', async () => {
  const deps = dependencies(task('RESPOND_TO_QUESTIONS', {
    transcript: 'The class begins on Monday morning.',
  }));
  const output = await worker.processEvent(event(), deps.values);
  assert.equal(output.status, 'completed');
  assert.deepEqual(output.pendingStages, []);
  const persisted = deps.calls[0].extracted.features;
  assert.equal(persisted.task.profile, 'RESPOND_TO_QUESTIONS');
  assert.equal(persisted.completion.speech, 'NOT_REQUIRED');
  assert.equal(persisted.completion.taskSemantic, 'NOT_REQUIRED');
});

test('permanent extraction errors dead-letter without retry', async () => {
  const deps = dependencies(task('UNKNOWN'));
  const output = await worker.processEvent(event(), deps.values);
  assert.equal(output.status, 'dead_letter');
  assert.equal(output.code, 'IIG_AI_FEATURE_PROFILE_UNSUPPORTED');
  assert.ok(deps.calls.some(call => call.deadLetter));
  assert.equal(deps.calls.some(call => call.retry), false);
});

test('feature event version must match the active extractor version', async () => {
  const deps = dependencies();
  const output = await worker.processEvent(event({
    payload: { ...event().payload, featureVersion: 'stale-feature-version' },
  }), deps.values);
  assert.equal(output.status, 'dead_letter');
  assert.equal(output.code, 'IIG_AI_FEATURE_VERSION_MISMATCH');
  assert.equal(deps.calls.some(call => call.deadLetter), true);
});

test('feature worker can claim one full Speaking submission concurrently', async () => {
  const queue = Array.from({ length: 11 }, (_, index) => event({
    id: `feature-event-${index + 1}`,
    payload: { ...event().payload, questionRunId: `question-${index + 1}` },
  }));
  let active = 0;
  let maximumActive = 0;
  const repository = {
    claimNext: async () => queue.shift() || null,
    loadTask: async claimed => task('RESPOND_TO_QUESTIONS', {
      questionRunId: claimed.payload.questionRunId,
      transcript: 'Monday morning.',
    }),
    completeTask: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setTimeout(resolve, 10));
      active -= 1;
      return { completed: true, featureSetId: FEATURE_SET_ID, pendingStages: [] };
    },
    markRetry: async () => {},
    markDeadLetter: async () => {},
  };
  const outputs = await worker.runBatch({
    repository,
    featureVersion: 'iig-ai-evidence-v1',
    concurrency: 11,
    workerId: 'feature-concurrency-test',
  });
  assert.equal(outputs.length, 11);
  assert.equal(outputs.filter(output => output?.status === 'completed').length, 11);
  assert.equal(maximumActive, 11);
});

test('extractor remains injectable for deterministic contract testing', async () => {
  const deps = dependencies();
  let called = false;
  await worker.processEvent(event(), {
    ...deps.values,
    extractor: input => {
      called = true;
      return extractFeatures(input);
    },
  });
  assert.equal(called, true);
});
