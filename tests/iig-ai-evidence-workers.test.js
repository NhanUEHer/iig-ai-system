const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const speechWorker = require('../src/modules/iig-ai-scoring/speechEvidenceWorker');
const taskWorker = require('../src/modules/iig-ai-scoring/taskEvidenceWorker');
const { FIELD_SPECS } = require('../src/modules/iig-ai-scoring/taskEvidenceContract');
const { getEvidenceContract } = require('../src/modules/iig-ai-scoring/evidenceContractRegistry');

const RUN_ID = '11a111ba-2883-78ce-98dd-335a6c85fc54';
const QUESTION_RUN_ID = '21a111ba-2883-78ce-98dd-335a6c85fc54';

function event(eventType = 'SPEECH_EVIDENCE_REQUESTED', overrides = {}) {
  return {
    id: `event-${eventType}`,
    runId: RUN_ID,
    eventType,
    payload: {},
    publishAttempts: 1,
    lockedBy: 'evidence-worker-1',
    ...overrides,
  };
}

function task(scorerType = 'RESPOND_TO_QUESTIONS', overrides = {}) {
  const writing = scorerType.startsWith('WRITE_') || scorerType === 'RESPOND_TO_WRITTEN_REQUEST';
  return {
    runId: RUN_ID,
    questionRunId: QUESTION_RUN_ID,
    questionAttemptId: '31a111ba-2883-78ce-98dd-335a6c85fc54',
    featureSetId: '41a111ba-2883-78ce-98dd-335a6c85fc54',
    featureVersion: 'iig-ai-evidence-v1',
    scorerType,
    transcript: writing ? null : 'The class begins on Monday morning.',
    features: {
      evidenceContract: { contractVersion: getEvidenceContract(scorerType).contractVersion },
      completion: {
        deterministic: 'READY',
        speech: writing ? 'NOT_REQUIRED' : 'PENDING',
        taskSemantic: scorerType === 'READ_TEXT_ALOUD' ? 'NOT_REQUIRED' : 'PENDING',
      },
      task: { deterministic: {} },
    },
    aiInput: {
      question: {
        scorerType,
        questionText: 'When does the class begin?',
        promptText: 'Answer clearly.',
        contextText: 'The class begins at 9 AM.',
      },
      response: writing
        ? { type: 'text', text: 'I recommend extending the opening hours.' }
        : { type: 'audio', audio: { durationSeconds: 18, checksumSha256: 'a'.repeat(64) } },
      media: scorerType === 'WRITE_SENTENCE_PICTURE'
        ? { questionImages: [{ id: 'image-1', storage: { mimeType: 'image/png' } }] }
        : {},
    },
    ...overrides,
  };
}

function speechOutput(scorerType = 'RESPOND_TO_QUESTIONS') {
  return {
    schema_version: 1,
    contract_version: getEvidenceContract(scorerType).contractVersion,
    status: 'SUCCESS',
    validity: { speech_present: true, language_code: 'en', intelligible_speech: true },
    delivery: {
      intelligibility: 0.82,
      listener_effort: 'LITTLE',
      pronunciation_accuracy: 0.8,
      stress_appropriateness: 0.7,
      pause_appropriateness: 0.75,
      pitch_appropriateness: 0.68,
      rhythm_appropriateness: 0.72,
    },
    fluency: {
      speech_rate_wpm: 118,
      filler_count: 1,
      repetition_count: 0,
      longest_pause_ms: 1300,
    },
  };
}

function evidenceValue(spec) {
  if (spec.type === 'boolean') return true;
  if (spec.type === 'integer') return 1;
  if (spec.type === 'number') return 0.75;
  return spec.values[0];
}

function taskOutput(scorerType) {
  return {
    schema_version: 1,
    contract_version: getEvidenceContract(scorerType).contractVersion,
    status: 'SUCCESS',
    validity: { usable: true, task_related: true },
    evidence: Object.fromEntries(
      Object.entries(FIELD_SPECS[scorerType]).map(([field, spec]) => [field, evidenceValue(spec)])
    ),
  };
}

function dependencies(loadedTask, output) {
  const calls = [];
  return {
    calls,
    repository: {
      loadTask: async () => loadedTask,
      startExecution: async input => {
        calls.push({ startExecution: input });
        return 'execution-1';
      },
      completeTask: async input => {
        calls.push({ completeTask: input });
        return { completed: true, ready: true };
      },
      markRetry: async input => calls.push({ retry: input }),
      markDeadLetter: async input => calls.push({ deadLetter: input }),
    },
    provider: {
      describe: () => ({
        provider: 'azure-ai',
        modelName: 'speech-evidence-v1',
        modelVersion: '2026-10-01',
        promptVersion: 'evidence-prompt-v1',
      }),
      analyze: async input => {
        calls.push({ analyze: input });
        return {
          output,
          usage: { inputTokens: 100, outputTokens: 25, cachedTokens: 10 },
          latencyMs: 450,
          estimatedCostUsd: 0.001,
          providerRequestId: 'provider-request-1',
        };
      },
    },
  };
}

test('speech worker builds a typed request and persists normalized evidence with lineage usage', async () => {
  const loadedTask = task();
  const deps = dependencies(loadedTask, speechOutput());
  const result = await speechWorker.processEvent(event(), deps);
  assert.equal(result.status, 'completed');
  const started = deps.calls.find(call => call.startExecution).startExecution;
  assert.equal(started.stage, 'SPEECH_EVIDENCE');
  assert.equal(started.lineage.provider, 'azure-ai');
  assert.match(started.requestHash, /^[0-9a-f]{64}$/);
  const analyzed = deps.calls.find(call => call.analyze).analyze;
  assert.equal(analyzed.request.transcript, loadedTask.transcript);
  const completed = deps.calls.find(call => call.completeTask).completeTask;
  assert.equal(completed.normalizedEvidence.delivery.listenerEffort, 'LITTLE');
  assert.equal(completed.providerResult.usage.inputTokens, 100);
  assert.match(completed.providerResult.responseHash, /^[0-9a-f]{64}$/);
});

test('task worker supports writing without creating speech evidence', async () => {
  const scorerType = 'WRITE_OPINION_ESSAY';
  const loadedTask = task(scorerType);
  const deps = dependencies(loadedTask, taskOutput(scorerType));
  const result = await taskWorker.processEvent(event('TASK_EVIDENCE_REQUESTED'), deps);
  assert.equal(result.status, 'completed');
  const analyzed = deps.calls.find(call => call.analyze).analyze;
  assert.equal(analyzed.request.candidate_response, loadedTask.aiInput.response.text);
  const completed = deps.calls.find(call => call.completeTask).completeTask;
  assert.equal(completed.normalizedEvidence.evidence.stance, 'CLEAR');
});

test('transient provider failure retries while invalid provider output dead-letters', async () => {
  const loadedTask = task();
  const transient = dependencies(loadedTask, speechOutput());
  transient.provider.analyze = async () => {
    throw Object.assign(new Error('Provider timeout.'), { code: 'PROVIDER_TIMEOUT' });
  };
  const retry = await speechWorker.processEvent(event(), transient);
  assert.equal(retry.status, 'retry');
  assert.equal(retry.code, 'PROVIDER_TIMEOUT');
  assert.equal(transient.calls.some(call => call.retry), true);

  const invalid = dependencies(loadedTask, { invalid: true });
  const deadLetter = await speechWorker.processEvent(event(), invalid);
  assert.equal(deadLetter.status, 'dead_letter');
  assert.equal(deadLetter.code, 'IIG_AI_FREE_SPEECH_EVIDENCE_INVALID');
  assert.equal(invalid.calls.some(call => call.deadLetter), true);
});

test('missing provider lineage is a permanent configuration failure', async () => {
  const deps = dependencies(task(), speechOutput());
  deps.provider.describe = () => ({ provider: 'azure-ai' });
  const result = await speechWorker.processEvent(event(), deps);
  assert.equal(result.status, 'dead_letter');
  assert.equal(result.code, 'IIG_AI_EVIDENCE_PROVIDER_LINEAGE_MISSING');
  assert.equal(deps.calls.some(call => call.startExecution), false);
});

test('evidence worker can process all eleven Speaking questions concurrently', async () => {
  const queue = Array.from({ length: 11 }, (_, index) => event('SPEECH_EVIDENCE_REQUESTED', {
    id: `evidence-event-${index + 1}`,
  }));
  let active = 0;
  let maximumActive = 0;
  const repository = {
    claimNext: async () => queue.shift() || null,
    loadTask: async claimed => task('RESPOND_TO_QUESTIONS', { questionRunId: claimed.id }),
    startExecution: async () => 'execution-1',
    completeTask: async () => ({ completed: true, ready: true }),
    markRetry: async () => {},
    markDeadLetter: async () => {},
  };
  const provider = {
    describe: () => ({ provider: 'test', modelName: 'test-model' }),
    analyze: async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setTimeout(resolve, 10));
      active -= 1;
      return { output: speechOutput() };
    },
  };
  const results = await speechWorker.runBatch({
    repository,
    provider,
    concurrency: 11,
    workerId: 'evidence-concurrency-test',
  });
  assert.equal(results.filter(result => result?.status === 'completed').length, 11);
  assert.equal(maximumActive, 11);
});

test('repository serializes evidence merge and dispatches scoring only after readiness', () => {
  const source = fs.readFileSync(path.join(
    __dirname,
    '../src/modules/iig-ai-scoring/evidenceWorkerRepository.js'
  ), 'utf8');
  assert.match(source, /FOR UPDATE SKIP LOCKED/);
  assert.match(source, /SELECT status, features FROM iig_ai_feature_sets[\s\S]*FOR UPDATE/);
  assert.match(source, /INSERT INTO iig_ai_model_executions/);
  assert.match(source, /input_tokens = \$5, output_tokens = \$6/);
  assert.match(source, /'QUESTION_SCORING_REQUESTED'/);
  assert.match(source, /ON CONFLICT \(deduplication_key\) DO NOTHING/);
  assert.match(source, /SET status = 'FAILED', error_code = \$2/);
});
