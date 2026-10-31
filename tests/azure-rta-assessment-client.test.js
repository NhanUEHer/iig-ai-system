const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const test = require('node:test');

const client = require('../src/clients/azureRtaAssessmentClient');

function segment({ display, confidence = 0.9, accuracy = 80 } = {}) {
  return {
    RecognitionStatus: 'Success',
    DisplayText: display,
    NBest: [{
      Confidence: confidence,
      Display: display,
      PronunciationAssessment: {
        AccuracyScore: accuracy,
        FluencyScore: 70,
        CompletenessScore: 90,
        ProsodyScore: 75,
        PronScore: 78,
      },
      Words: [{
        Word: 'Hello',
        Offset: 100,
        Duration: 200,
        PronunciationAssessment: { AccuracyScore: accuracy, ErrorType: 'None' },
        Phonemes: [{
          Phoneme: 'h',
          PronunciationAssessment: { AccuracyScore: accuracy },
        }],
      }],
    }],
  };
}

test('Azure RTA result preserves raw detailed segments and exposes one transcript', () => {
  const output = client.buildProviderResult({
    segments: [
      segment({ display: 'Good evening,', confidence: 0.8 }),
      segment({ display: 'everyone.', confidence: 1 }),
    ],
    latencyMs: 2100,
    providerRunId: 'azure-session-1',
  });

  assert.equal(output.provider, 'azure-ai-speech');
  assert.equal(output.result.status, 'SUCCESS');
  assert.equal(output.result.transcript, 'Good evening, everyone.');
  assert.equal(output.result.confidence, 0.9);
  assert.equal(output.outcome.action, 'CONTINUE');
  assert.equal(output.rawOutput.schemaVersion, 'azure-rta-raw-v1');
  assert.equal(output.rawOutput.segments.length, 2);
  assert.equal(output.rawOutput.segments[0].NBest[0].Words[0].Phonemes[0].Phoneme, 'h');
  assert.equal(output.usage.elapsedTime, 2.1);
});

test('Azure RTA result maps an empty recognition session to NO_SPEECH', () => {
  const output = client.buildProviderResult({ segments: [], latencyMs: 500 });
  assert.equal(output.result.status, 'NO_SPEECH');
  assert.equal(output.result.speechDetected, false);
  assert.equal(output.outcome.action, 'INVALID_AUDIO');
});

test('Azure RTA assessment normalizes audio before invoking continuous recognition', async () => {
  let recognitionInput = null;
  const output = await client.assess({
    audioBuffer: Buffer.from('compressed-audio'),
    referenceText: 'Good evening, everyone.',
    key: 'test-key',
    region: 'southeastasia',
    timeoutMs: 5000,
  }, {
    execFileAsync: async (_command, args) => {
      await fsp.writeFile(args.at(-1), Buffer.from('RIFF-test-wav'));
    },
    recognizeContinuous: async input => {
      recognitionInput = input;
      return {
        providerRunId: 'azure-session-2',
        segments: [segment({ display: 'Good evening, everyone.' })],
      };
    },
  });

  assert.equal(recognitionInput.referenceText, 'Good evening, everyone.');
  assert.equal(recognitionInput.region, 'southeastasia');
  assert.match(recognitionInput.wavPath, /candidate-16khz-mono\.wav$/);
  assert.equal(output.providerRunId, 'azure-session-2');
  assert.equal(output.result.status, 'SUCCESS');
});

test('Azure RTA assessment rejects missing secrets without exposing them', async () => {
  await assert.rejects(
    () => client.assess({
      audioBuffer: Buffer.from('audio'),
      referenceText: 'Passage.',
      key: '',
      region: 'southeastasia',
    }),
    error => error.code === 'IIG_AI_RTA_AZURE_CONFIG_MISSING' && error.retryable === false
  );
});
