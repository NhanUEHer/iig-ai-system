const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeAzureEvidence,
  provider,
} = require('../src/modules/iig-ai-scoring/azureRtaEvidenceProvider');

function word(value, accuracy, offset, feedback = {}) {
  return {
    Word: value,
    Offset: offset,
    Duration: 10_000_000,
    PronunciationAssessment: {
      AccuracyScore: accuracy,
      ErrorType: accuracy < 60 ? 'Mispronunciation' : 'None',
      Feedback: { Prosody: feedback },
    },
    Phonemes: [
      { PronunciationAssessment: { AccuracyScore: accuracy } },
      { PronunciationAssessment: { AccuracyScore: Math.min(100, accuracy + 10) } },
    ],
  };
}

function segment(words, scores) {
  return {
    RecognitionStatus: 'Success',
    NBest: [{
      Confidence: 0.9,
      Words: words,
      PronunciationAssessment: scores,
    }],
  };
}

function request() {
  return {
    audio: { duration_seconds: 10 },
    deterministic_alignment: {
      reference_word_count: 5,
      response_word_count: 4,
      matches: 3,
      substitutions: 1,
      omissions: 1,
      insertions: 0,
      word_coverage: 0.6,
      alignment_ratio: 0.6,
    },
  };
}

function rawOutput() {
  return {
    schemaVersion: 'azure-rta-raw-v1',
    segments: [
      segment([
        word('good', 80, 0, {
          Break: { UnexpectedBreak: { Confidence: 0.8 }, BreakLength: 15_000_000 },
          Intonation: { ErrorTypes: ['Monotone'] },
        }),
        word('evening', 50, 10_000_000),
      ], {
        AccuracyScore: 65, FluencyScore: 60, CompletenessScore: 50, ProsodyScore: 60, PronScore: 59,
      }),
      segment([
        word('everyone', 90, 20_000_000),
        word('today', 30, 30_000_000),
      ], {
        AccuracyScore: 70, FluencyScore: 80, CompletenessScore: 70, ProsodyScore: 80, PronScore: 72,
      }),
    ],
  };
}

test('Azure continuous RTA evidence becomes deterministic ML-ready features', () => {
  const output = normalizeAzureEvidence({ rawOutput: rawOutput(), request: request() });
  assert.equal(output.schema_version, 2);
  assert.equal(output.contract_version, 'ets-rta-evidence-v2');
  assert.equal(output.alignment.omissions, 1);
  assert.equal(output.alignment.completeness_ratio, 0.8);
  assert.equal(output.azure_scores.continuous.accuracy, 62.5);
  assert.equal(output.azure_scores.continuous.fluency, 50);
  assert.equal(output.azure_scores.continuous.completeness, 80);
  assert.equal(output.azure_scores.continuous.prosody, 70);
  assert.equal(output.azure_scores.continuous.pronunciation, 62.5);
  assert.equal(output.pronunciation.mispronunciation_count, 2);
  assert.equal(output.pronunciation.mean_phoneme_accuracy, 67.5);
  assert.equal(output.prosody.unexpected_break_count, 1);
  assert.equal(output.prosody.longest_pause_ms, 1500);
  assert.equal(output.prosody.monotone_segment_count, 1);
  assert.equal(output.timing.speech_rate_wpm, 24);
});

test('provider is local, token-free and preserves Azure request lineage', async () => {
  const result = await provider.analyze({
    request: request(),
    task: {
      answerSttRawOutput: rawOutput(),
      answerSttProviderRequestId: 'azure-session-1',
    },
  });
  assert.equal(provider.describe().provider, 'LOCAL_DETERMINISTIC');
  assert.equal(result.providerRequestId, 'azure-session-1');
  assert.deepEqual(result.usage, { inputTokens: 0, outputTokens: 0, cachedTokens: 0 });
  assert.match(result.responseHash, /^[0-9a-f]{64}$/);
});

test('provider rejects incompatible or empty Azure raw evidence', () => {
  assert.throws(
    () => normalizeAzureEvidence({ rawOutput: { schemaVersion: 'legacy', segments: [] }, request: request() }),
    error => error.code === 'IIG_AI_RTA_AZURE_RAW_MISSING'
  );
});
