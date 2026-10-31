const assert = require('node:assert/strict');
const test = require('node:test');

const { getEvidenceContract } = require('../src/modules/iig-ai-scoring/evidenceContractRegistry');
const {
  buildReadAloudEvidenceRequest,
  normalizeReadAloudSpeechEvidence,
} = require('../src/modules/iig-ai-scoring/readAloudEvidenceContract');

function input() {
  return {
    question: {
      scorerType: 'READ_TEXT_ALOUD',
      contextText: 'Good evening everyone. Welcome to our program.',
    },
    response: {
      type: 'audio',
      audio: {
        durationSeconds: 12.5,
        checksumSha256: 'a'.repeat(64),
      },
    },
  };
}

function alignment() {
  return {
    rtaAlignment: {
      referenceWordCount: 8,
      responseWordCount: 8,
      matches: 7,
      substitutions: 1,
      omissions: 0,
      insertions: 0,
      wordCoverage: 0.875,
      alignmentRatio: 0.875,
    },
  };
}

function providerOutput() {
  return {
    schema_version: 2,
    contract_version: 'ets-rta-evidence-v2',
    status: 'SUCCESS',
    validity: {
      speech_present: true,
      language_code: 'en',
      task_related: true,
    },
    source: {
      provider: 'azure-ai-speech',
      raw_schema_version: 'azure-rta-raw-v1',
      aggregation_version: 'azure-continuous-rta-v1',
      segment_count: 2,
      low_accuracy_threshold: 60,
      break_confidence_threshold: 0.75,
    },
    alignment: {
      reference_word_count: 8,
      response_word_count: 8,
      matches: 7,
      substitutions: 1,
      omissions: 0,
      insertions: 0,
      exact_match_ratio: 0.875,
      completeness_ratio: 1,
      insertion_ratio: 0,
      alignment_ratio: 0.875,
    },
    azure_scores: {
      continuous: {
        accuracy: 81,
        fluency: 78,
        completeness: 100,
        prosody: 74,
        pronunciation: 79,
      },
      segment_mean: {
        accuracy: 80,
        fluency: 79,
        completeness: 91,
        prosody: 74,
        pronunciation: 78,
      },
    },
    pronunciation: {
      assessed_word_count: 8,
      correctly_pronounced_word_count: 7,
      mispronunciation_count: 1,
      mispronunciation_ratio: 0.125,
      low_accuracy_word_count: 1,
      low_accuracy_word_ratio: 0.125,
      severe_accuracy_word_count: 0,
      severe_accuracy_word_ratio: 0,
      mean_word_accuracy: 81,
      mean_phoneme_accuracy: 79,
      low_accuracy_phoneme_ratio: 0.1,
      error_items: [{
        observed: 'program',
        category: 'MISPRONUNCIATION',
        accuracy_score: 55,
        segment: 2,
        start_ms: 8500,
        end_ms: 9100,
      }],
    },
    prosody: {
      unexpected_break_count: 1,
      missing_break_count: 0,
      longest_pause_ms: 1400,
      monotone_segment_count: 1,
      monotone_segment_ratio: 0.5,
    },
    timing: {
      audio_duration_seconds: 12.5,
      recognized_duration_ms: 11000,
      speech_rate_wpm: 112,
    },
    flags: ['MINOR_ENDING_SOUND_ERROR'],
  };
}

test('RTA registry exposes only the two official ETS score traits', () => {
  const contract = getEvidenceContract('read_text_aloud');
  assert.equal(contract.officialScoreMode, 'TRAIT_SCORES');
  assert.deepEqual(contract.officialScale, [0, 1, 2, 3]);
  assert.deepEqual(contract.officialTraits.map(trait => trait.key), [
    'pronunciation',
    'intonation_stress',
  ]);
  assert.deepEqual(contract.requiredEvidenceFamilies, [
    'validity',
    'alignment',
    'pronunciation',
    'prosody',
  ]);
});

test('RTA request combines canonical source data and deterministic alignment', () => {
  const request = buildReadAloudEvidenceRequest({
    aiInput: input(),
    transcript: 'Good evening everyone. Welcome our program.',
    deterministicFeatures: alignment(),
  });
  assert.equal(request.schema_version, 2);
  assert.equal(request.contract_version, 'ets-rta-evidence-v2');
  assert.deepEqual(request.official_traits, ['pronunciation', 'intonation_stress']);
  assert.equal(request.deterministic_alignment.matches, 7);
  assert.equal(request.audio.checksum_sha256, 'a'.repeat(64));
  assert.equal(Object.hasOwn(request, 'score'), false);
  assert.equal(Object.hasOwn(request, 'final_score'), false);
});

test('RTA provider evidence is normalized without producing a score', () => {
  const normalized = normalizeReadAloudSpeechEvidence(providerOutput());
  assert.equal(normalized.status, 'SUCCESS');
  assert.equal(normalized.azureScores.continuous.accuracy, 81);
  assert.equal(normalized.pronunciation.mispronunciationRatio, 0.125);
  assert.equal(normalized.prosody.monotoneSegmentRatio, 0.5);
  assert.equal(normalized.timing.speechRateWpm, 112);
  assert.equal(Object.hasOwn(normalized, 'score'), false);
  assert.equal(Object.hasOwn(normalized.pronunciation, 'score'), false);
});

test('business-invalid evidence remains structured and contains no fabricated metrics', () => {
  const normalized = normalizeReadAloudSpeechEvidence({
    schema_version: 2,
    contract_version: 'ets-rta-evidence-v2',
    status: 'NO_SPEECH',
    validity: {
      speech_present: false,
      language_code: null,
      task_related: false,
    },
    flags: ['ONLY_PHYSICAL_NOISE'],
  });
  assert.equal(normalized.status, 'NO_SPEECH');
  assert.equal(normalized.pronunciation, null);
  assert.equal(normalized.prosody, null);
});

test('contract rejects incompatible versions, impossible success and out-of-range metrics', () => {
  assert.throws(
    () => normalizeReadAloudSpeechEvidence({ ...providerOutput(), contract_version: 'stale-v0' }),
    error => error.code === 'IIG_AI_RTA_EVIDENCE_CONTRACT_MISMATCH'
  );
  assert.throws(
    () => normalizeReadAloudSpeechEvidence({
      ...providerOutput(),
      validity: { speech_present: false, language_code: 'en', task_related: true },
    }),
    error => error.code === 'IIG_AI_RTA_EVIDENCE_OUTPUT_CONTRADICTORY'
  );
  assert.throws(
    () => normalizeReadAloudSpeechEvidence({
      ...providerOutput(),
      pronunciation: { ...providerOutput().pronunciation, mean_word_accuracy: 120 },
    }),
    error => error.code === 'IIG_AI_RTA_EVIDENCE_OUTPUT_INVALID'
  );
});
