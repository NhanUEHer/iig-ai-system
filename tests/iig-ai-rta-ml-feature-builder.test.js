const assert = require('node:assert/strict');
const test = require('node:test');

const {
  RTA_ML_FEATURE_NAMES,
  RTA_ML_FEATURE_VERSION,
  tokenize,
  properNounIndexes,
  buildRtaMlFeatures,
} = require('../src/modules/iig-ai-scoring/rtaMlFeatureBuilder');

function fixture({ passage, transcript, completenessRatio = 0.8 }) {
  const responseWords = transcript.split(/\s+/).filter(Boolean).length;
  return {
    aiInput: {
      question: { scorerType: 'READ_TEXT_ALOUD', contextText: passage },
      response: {
        type: 'audio',
        audio: { durationSeconds: 20, quality: { silenceRatio: 0.1 } },
      },
    },
    transcript,
    features: {
      featureVersion: 'iig-ai-evidence-v2',
      evidenceContract: { contractVersion: 'ets-rta-evidence-v2' },
      completion: { deterministic: 'READY', speech: 'READY', taskSemantic: 'NOT_REQUIRED' },
      common: { audioQuality: { silenceRatio: 0.1 } },
      speech: {
        status: 'SUCCESS',
        source: { segmentCount: 2 },
        alignment: {
          alignmentRatio: 0.75,
          exactMatchRatio: 0.78,
          completenessRatio,
          insertionRatio: 0.05,
        },
        azureScores: {
          continuous: { accuracy: 72, fluency: 65, completeness: 80, prosody: 70, pronunciation: 69 },
          segmentMean: { accuracy: 73, fluency: 78, completeness: 82, prosody: 71, pronunciation: 72 },
        },
        pronunciation: {
          assessedWordCount: responseWords,
          mispronunciationRatio: 0.2,
          lowAccuracyWordRatio: 0.2,
          severeAccuracyWordRatio: 0.1,
          meanWordAccuracy: 72,
          meanPhonemeAccuracy: 70,
          lowAccuracyPhonemeRatio: 0.22,
          errorItems: [
            { observed: 'blossoms', accuracyScore: 35, segment: 1, startMs: 500, endMs: 900 },
          ],
        },
        prosody: {
          unexpectedBreakCount: 2,
          missingBreakCount: 3,
          monotoneSegmentRatio: 0.5,
          longestPauseMs: 1200,
        },
        timing: {
          audioDurationSeconds: 20,
          recognizedDurationMs: 16000,
          speechRateWpm: 110,
        },
      },
    },
    azureRawOutput: {
      schemaVersion: 'azure-rta-raw-v1',
      segments: [{ NBest: [{ Words: [{ Word: 'Welcome', Offset: 15000000, Duration: 3000000 }] }] }],
    },
  };
}

test('builder emits one ordered numeric vector and separate deterministic rule context', () => {
  const result = buildRtaMlFeatures(fixture({
    passage: 'Welcome to Blossoms Market. Our valued customers receive baked goods.',
    transcript: 'Welcome to Blossoms Market our value customers receive bake goods',
  }));

  assert.equal(result.featureVersion, RTA_ML_FEATURE_VERSION);
  assert.deepEqual(result.featureNames, RTA_ML_FEATURE_NAMES);
  assert.equal(result.vector.length, RTA_ML_FEATURE_NAMES.length);
  assert.ok(result.vector.every(Number.isFinite));
  assert.equal(result.values.suffix_slip_count, 2);
  assert.equal(result.ruleContext.suffixLeniencyEligible, true);
  assert.equal(result.ruleContext.properNounViolation, true);
  assert.equal(result.ruleContext.completionBand, 'FROM_67_TO_90');
  assert.match(result.featureFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(Object.hasOwn(result, 'score'), false);
  assert.equal(JSON.stringify(result).includes('Welcome to Blossoms'), false);
});

test('wrong-passage gate uses content-word coverage below fifty percent', () => {
  const result = buildRtaMlFeatures(fixture({
    passage: 'Customers receive promotional discounts on premium sandwiches tomorrow.',
    transcript: 'Weather reports predict heavy rain across northern regions today.',
    completenessRatio: 0.4,
  }));

  assert.equal(result.ruleContext.wrongPassage, true);
  assert.ok(result.ruleContext.contentWordCoverage < 0.5);
  assert.equal(result.ruleContext.completionBand, 'BELOW_67');
});

test('proper-noun detection excludes a capitalized word that starts the next sentence', () => {
  const tokens = tokenize('Welcome to Blossoms Market! Currently, discounts are available.');
  const properNouns = [...properNounIndexes(tokens)].map(index => tokens[index].surface);
  assert.deepEqual(properNouns, ['Blossoms', 'Market']);
});

test('builder rejects feature sets that are not ready or lack Azure raw timing', () => {
  const input = fixture({ passage: 'Read this passage clearly.', transcript: 'Read this passage clearly.' });
  input.features.completion.speech = 'PENDING';
  assert.throws(
    () => buildRtaMlFeatures(input),
    error => error.code === 'IIG_AI_RTA_ML_EVIDENCE_NOT_READY' && error.retryable === false
  );

  input.features.completion.speech = 'READY';
  input.azureRawOutput = null;
  assert.throws(
    () => buildRtaMlFeatures(input),
    error => error.code === 'IIG_AI_RTA_ML_AZURE_RAW_MISSING' && error.retryable === false
  );
});
