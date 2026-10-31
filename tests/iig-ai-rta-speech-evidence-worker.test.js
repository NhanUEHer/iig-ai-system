const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const worker = require('../src/modules/iig-ai-scoring/rtaSpeechEvidenceWorker');

function event() {
  return {
    id: 'event-rta-evidence-1',
    runId: '11a111ba-2883-78ce-98dd-335a6c85fc54',
    eventType: 'SPEECH_EVIDENCE_REQUESTED',
    payload: { scorerType: 'READ_TEXT_ALOUD', evidenceContractVersion: 'ets-rta-evidence-v2' },
    publishAttempts: 1,
    lockedBy: 'rta-evidence-worker-1',
  };
}

function task() {
  return {
    runId: event().runId,
    questionRunId: '21a111ba-2883-78ce-98dd-335a6c85fc54',
    questionAttemptId: '31a111ba-2883-78ce-98dd-335a6c85fc54',
    featureSetId: '41a111ba-2883-78ce-98dd-335a6c85fc54',
    featureVersion: 'iig-ai-evidence-v2',
    scorerType: 'READ_TEXT_ALOUD',
    transcript: 'Good evening everyone.',
    features: {
      evidenceContract: { contractVersion: 'ets-rta-evidence-v2' },
      task: {
        deterministic: {
          rtaAlignment: {
            referenceWordCount: 3,
            responseWordCount: 3,
            matches: 3,
            substitutions: 0,
            omissions: 0,
            insertions: 0,
            wordCoverage: 1,
            alignmentRatio: 1,
          },
        },
      },
    },
    aiInput: {
      question: { scorerType: 'READ_TEXT_ALOUD', contextText: 'Good evening everyone.' },
      response: {
        type: 'audio',
        audio: { durationSeconds: 3, checksumSha256: 'a'.repeat(64) },
      },
    },
    answerSttProviderRequestId: 'azure-session-1',
    answerSttRawOutput: {
      schemaVersion: 'azure-rta-raw-v1',
      segments: [{
        NBest: [{
          Words: ['good', 'evening', 'everyone'].map((value, index) => ({
            Word: value,
            Offset: index * 10_000_000,
            Duration: 10_000_000,
            PronunciationAssessment: { AccuracyScore: 80, ErrorType: 'None' },
            Phonemes: [{ PronunciationAssessment: { AccuracyScore: 80 } }],
          })),
          PronunciationAssessment: {
            AccuracyScore: 80,
            FluencyScore: 80,
            CompletenessScore: 100,
            ProsodyScore: 75,
            PronScore: 79,
          },
        }],
      }],
    },
  };
}

test('RTA worker uses the deterministic Azure provider and produces ML evidence without injection', async () => {
  const calls = [];
  const repository = {
    loadTask: async () => task(),
    startExecution: async input => {
      calls.push({ start: input });
      return 'execution-1';
    },
    completeTask: async input => {
      calls.push({ complete: input });
      return { completed: true, ready: true };
    },
    markRetry: async () => {},
    markDeadLetter: async () => {},
  };
  const result = await worker.processEvent(event(), { repository });
  assert.equal(result.status, 'completed');
  assert.equal(calls[0].start.lineage.provider, 'LOCAL_DETERMINISTIC');
  assert.equal(calls[1].complete.normalizedEvidence.schemaVersion, 2);
  assert.equal(calls[1].complete.normalizedEvidence.azureScores.continuous.accuracy, 80);
  assert.equal(calls[1].complete.providerResult.usage.inputTokens, 0);
});

test('RTA worker claim is isolated by scorer type and evidence contract version', async () => {
  let claimOptions = null;
  const repository = {
    claimNext: async (_stage, _workerId, options) => {
      claimOptions = options;
      return null;
    },
  };
  const result = await worker.runOnce({ repository, workerId: 'test-worker' });
  assert.equal(result, null);
  assert.deepEqual(claimOptions, {
    scorerTypes: ['READ_TEXT_ALOUD'],
    evidenceContractVersion: 'ets-rta-evidence-v2',
  });
});

test('repository loads latest completed ANSWER_STT raw evidence for the RTA worker', () => {
  const source = fs.readFileSync(path.join(
    __dirname,
    '../src/modules/iig-ai-scoring/evidenceWorkerRepository.js'
  ), 'utf8');
  assert.match(source, /execution\.stage = 'ANSWER_STT'/);
  assert.match(source, /execution\.status = 'COMPLETED'/);
  assert.match(source, /answer_stt_raw_output/);
  assert.match(source, /payload->>'evidenceContractVersion'/);
});
