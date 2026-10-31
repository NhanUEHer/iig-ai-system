const { getEvidenceContract } = require('./evidenceContractRegistry');

const READ_ALOUD_SPEECH_EVIDENCE_SCHEMA_VERSION = 2;
const EVIDENCE_STATUSES = Object.freeze(['SUCCESS', 'NO_SPEECH', 'WRONG_LANGUAGE', 'FAILED']);
const LISTENER_EFFORT_LEVELS = Object.freeze(['NONE', 'LITTLE', 'SOME', 'SIGNIFICANT', 'EXTREME']);
const SEVERITY_LEVELS = Object.freeze(['MINOR', 'MODERATE', 'MAJOR']);

function contractError(message, code, retryable = false) {
  return Object.assign(new Error(message), { code, retryable });
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw contractError(`${field} must be an object.`, 'IIG_AI_RTA_EVIDENCE_OUTPUT_INVALID');
  }
  return value;
}

function text(value) {
  return String(value || '').normalize('NFKC').trim();
}

function finiteNumber(value, field, { minimum = -Infinity, maximum = Infinity, nullable = false } = {}) {
  if (nullable && (value === null || value === undefined || value === '')) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw contractError(`${field} is outside its accepted numeric range.`, 'IIG_AI_RTA_EVIDENCE_OUTPUT_INVALID');
  }
  return parsed;
}

function integer(value, field, options = {}) {
  const parsed = finiteNumber(value, field, options);
  if (!Number.isInteger(parsed)) {
    throw contractError(`${field} must be an integer.`, 'IIG_AI_RTA_EVIDENCE_OUTPUT_INVALID');
  }
  return parsed;
}

function boolean(value, field) {
  if (typeof value !== 'boolean') {
    throw contractError(`${field} must be a boolean.`, 'IIG_AI_RTA_EVIDENCE_OUTPUT_INVALID');
  }
  return value;
}

function enumValue(value, field, accepted) {
  const normalized = text(value).toUpperCase();
  if (!accepted.includes(normalized)) {
    throw contractError(`${field} contains an unsupported value.`, 'IIG_AI_RTA_EVIDENCE_OUTPUT_INVALID');
  }
  return normalized;
}

function nullableRatio(value, field) {
  return finiteNumber(value, field, { minimum: 0, maximum: 1, nullable: true });
}

function nullableScore(value, field) {
  return finiteNumber(value, field, { minimum: 0, maximum: 100, nullable: true });
}

function normalizeErrorItems(value) {
  if (!Array.isArray(value)) {
    throw contractError('pronunciation.error_items must be an array.', 'IIG_AI_RTA_EVIDENCE_OUTPUT_INVALID');
  }
  return value.map((item, index) => {
    const candidate = object(item, `pronunciation.error_items[${index}]`);
    const observed = text(candidate.observed);
    const expected = text(candidate.expected);
    if (!observed && !expected) {
      throw contractError(
        `pronunciation.error_items[${index}] requires observed or expected text.`,
        'IIG_AI_RTA_EVIDENCE_OUTPUT_INVALID'
      );
    }
    return {
      observed: observed || null,
      expected: expected || null,
      category: text(candidate.category).toUpperCase() || 'OTHER',
      severity: enumValue(
        candidate.severity,
        `pronunciation.error_items[${index}].severity`,
        SEVERITY_LEVELS
      ),
      startMs: finiteNumber(candidate.start_ms, `pronunciation.error_items[${index}].start_ms`, {
        minimum: 0,
        nullable: true,
      }),
      endMs: finiteNumber(candidate.end_ms, `pronunciation.error_items[${index}].end_ms`, {
        minimum: 0,
        nullable: true,
      }),
    };
  });
}

function buildReadAloudEvidenceRequest({ aiInput, transcript, deterministicFeatures }) {
  const contract = getEvidenceContract('READ_TEXT_ALOUD');
  const question = object(aiInput?.question, 'aiInput.question');
  const response = object(aiInput?.response, 'aiInput.response');
  const referenceText = text(question.contextText);
  const normalizedTranscript = text(transcript);
  if (text(question.scorerType).toUpperCase() !== 'READ_TEXT_ALOUD') {
    throw contractError('Read Aloud evidence requires READ_TEXT_ALOUD input.', 'IIG_AI_RTA_EVIDENCE_INPUT_INVALID');
  }
  if (response.type !== 'audio' || !response.audio) {
    throw contractError('Read Aloud evidence requires a prepared audio response.', 'IIG_AI_RTA_EVIDENCE_AUDIO_REQUIRED');
  }
  if (!referenceText) {
    throw contractError('Read Aloud evidence requires the official passage.', 'IIG_AI_RTA_EVIDENCE_REFERENCE_MISSING');
  }
  if (!normalizedTranscript) {
    throw contractError('Read Aloud evidence requires a transcript.', 'IIG_AI_RTA_EVIDENCE_TRANSCRIPT_MISSING');
  }
  const alignment = object(deterministicFeatures?.rtaAlignment, 'deterministicFeatures.rtaAlignment');
  return {
    schema_version: READ_ALOUD_SPEECH_EVIDENCE_SCHEMA_VERSION,
    contract_version: contract.contractVersion,
    task_profile: contract.taskProfile,
    official_traits: contract.officialTraits.map(trait => trait.key),
    reference_text: referenceText,
    transcript: normalizedTranscript,
    audio: {
      duration_seconds: response.audio.durationSeconds ?? null,
      checksum_sha256: text(response.audio.checksumSha256) || null,
    },
    deterministic_alignment: {
      reference_word_count: alignment.referenceWordCount,
      response_word_count: alignment.responseWordCount,
      matches: alignment.matches,
      substitutions: alignment.substitutions,
      omissions: alignment.omissions,
      insertions: alignment.insertions,
      word_coverage: alignment.wordCoverage,
      alignment_ratio: alignment.alignmentRatio,
    },
  };
}

function normalizeReadAloudSpeechEvidence(value) {
  const payload = object(value, 'speechEvidence');
  if (integer(payload.schema_version, 'schema_version', { minimum: 1 })
    !== READ_ALOUD_SPEECH_EVIDENCE_SCHEMA_VERSION) {
    throw contractError(
      'Read Aloud speech evidence schema version is incompatible.',
      'IIG_AI_RTA_EVIDENCE_SCHEMA_UNSUPPORTED'
    );
  }
  const contract = getEvidenceContract('READ_TEXT_ALOUD');
  if (text(payload.contract_version) !== contract.contractVersion) {
    throw contractError(
      'Read Aloud evidence contract version is incompatible.',
      'IIG_AI_RTA_EVIDENCE_CONTRACT_MISMATCH'
    );
  }
  const status = enumValue(payload.status, 'status', EVIDENCE_STATUSES);
  const validity = object(payload.validity, 'validity');
  const normalizedValidity = {
    speechPresent: boolean(validity.speech_present, 'validity.speech_present'),
    languageCode: text(validity.language_code).toLowerCase() || null,
    taskRelated: boolean(validity.task_related, 'validity.task_related'),
  };
  if (status !== 'SUCCESS') {
    return {
      schemaVersion: READ_ALOUD_SPEECH_EVIDENCE_SCHEMA_VERSION,
      contractVersion: contract.contractVersion,
      status,
      validity: normalizedValidity,
      source: null,
      alignment: null,
      azureScores: null,
      pronunciation: null,
      prosody: null,
      timing: null,
      flags: Array.isArray(payload.flags) ? payload.flags.map(text).filter(Boolean) : [],
    };
  }
  if (!normalizedValidity.speechPresent || normalizedValidity.languageCode !== 'en') {
    throw contractError(
      'Successful Read Aloud evidence must contain English speech.',
      'IIG_AI_RTA_EVIDENCE_OUTPUT_CONTRADICTORY'
    );
  }
  const source = object(payload.source, 'source');
  const alignment = object(payload.alignment, 'alignment');
  const azureScores = object(payload.azure_scores, 'azure_scores');
  const continuous = object(azureScores.continuous, 'azure_scores.continuous');
  const segmentMean = object(azureScores.segment_mean, 'azure_scores.segment_mean');
  const pronunciation = object(payload.pronunciation, 'pronunciation');
  const prosody = object(payload.prosody, 'prosody');
  const timing = object(payload.timing, 'timing');
  return {
    schemaVersion: READ_ALOUD_SPEECH_EVIDENCE_SCHEMA_VERSION,
    contractVersion: contract.contractVersion,
    status,
    validity: normalizedValidity,
    source: {
      provider: text(source.provider),
      rawSchemaVersion: text(source.raw_schema_version),
      aggregationVersion: text(source.aggregation_version),
      segmentCount: integer(source.segment_count, 'source.segment_count', { minimum: 1 }),
      lowAccuracyThreshold: finiteNumber(source.low_accuracy_threshold, 'source.low_accuracy_threshold', {
        minimum: 0, maximum: 100,
      }),
      breakConfidenceThreshold: nullableRatio(
        source.break_confidence_threshold,
        'source.break_confidence_threshold'
      ),
    },
    alignment: {
      referenceWordCount: integer(alignment.reference_word_count, 'alignment.reference_word_count', { minimum: 1 }),
      responseWordCount: integer(alignment.response_word_count, 'alignment.response_word_count', { minimum: 0 }),
      matches: integer(alignment.matches, 'alignment.matches', { minimum: 0 }),
      substitutions: integer(alignment.substitutions, 'alignment.substitutions', { minimum: 0 }),
      omissions: integer(alignment.omissions, 'alignment.omissions', { minimum: 0 }),
      insertions: integer(alignment.insertions, 'alignment.insertions', { minimum: 0 }),
      exactMatchRatio: nullableRatio(alignment.exact_match_ratio, 'alignment.exact_match_ratio'),
      completenessRatio: nullableRatio(alignment.completeness_ratio, 'alignment.completeness_ratio'),
      insertionRatio: nullableRatio(alignment.insertion_ratio, 'alignment.insertion_ratio'),
      alignmentRatio: nullableRatio(alignment.alignment_ratio, 'alignment.alignment_ratio'),
    },
    azureScores: {
      continuous: {
        accuracy: nullableScore(continuous.accuracy, 'azure_scores.continuous.accuracy'),
        fluency: nullableScore(continuous.fluency, 'azure_scores.continuous.fluency'),
        completeness: nullableScore(continuous.completeness, 'azure_scores.continuous.completeness'),
        prosody: nullableScore(continuous.prosody, 'azure_scores.continuous.prosody'),
        pronunciation: nullableScore(continuous.pronunciation, 'azure_scores.continuous.pronunciation'),
      },
      segmentMean: {
        accuracy: nullableScore(segmentMean.accuracy, 'azure_scores.segment_mean.accuracy'),
        fluency: nullableScore(segmentMean.fluency, 'azure_scores.segment_mean.fluency'),
        completeness: nullableScore(segmentMean.completeness, 'azure_scores.segment_mean.completeness'),
        prosody: nullableScore(segmentMean.prosody, 'azure_scores.segment_mean.prosody'),
        pronunciation: nullableScore(segmentMean.pronunciation, 'azure_scores.segment_mean.pronunciation'),
      },
    },
    pronunciation: {
      assessedWordCount: integer(pronunciation.assessed_word_count, 'pronunciation.assessed_word_count', {
        minimum: 1,
      }),
      correctlyPronouncedWordCount: integer(
        pronunciation.correctly_pronounced_word_count,
        'pronunciation.correctly_pronounced_word_count',
        { minimum: 0 }
      ),
      mispronunciationCount: integer(
        pronunciation.mispronunciation_count,
        'pronunciation.mispronunciation_count',
        { minimum: 0 }
      ),
      mispronunciationRatio: nullableRatio(
        pronunciation.mispronunciation_ratio,
        'pronunciation.mispronunciation_ratio'
      ),
      lowAccuracyWordCount: integer(
        pronunciation.low_accuracy_word_count,
        'pronunciation.low_accuracy_word_count',
        { minimum: 0 }
      ),
      lowAccuracyWordRatio: nullableRatio(
        pronunciation.low_accuracy_word_ratio,
        'pronunciation.low_accuracy_word_ratio'
      ),
      severeAccuracyWordCount: integer(
        pronunciation.severe_accuracy_word_count,
        'pronunciation.severe_accuracy_word_count',
        { minimum: 0 }
      ),
      severeAccuracyWordRatio: nullableRatio(
        pronunciation.severe_accuracy_word_ratio,
        'pronunciation.severe_accuracy_word_ratio'
      ),
      meanWordAccuracy: nullableScore(pronunciation.mean_word_accuracy, 'pronunciation.mean_word_accuracy'),
      meanPhonemeAccuracy: nullableScore(
        pronunciation.mean_phoneme_accuracy,
        'pronunciation.mean_phoneme_accuracy'
      ),
      lowAccuracyPhonemeRatio: nullableRatio(
        pronunciation.low_accuracy_phoneme_ratio,
        'pronunciation.low_accuracy_phoneme_ratio'
      ),
      errorItems: Array.isArray(pronunciation.error_items)
        ? pronunciation.error_items.map((item, index) => {
          const candidate = object(item, `pronunciation.error_items[${index}]`);
          return {
            observed: text(candidate.observed) || null,
            category: text(candidate.category).toUpperCase() || 'OTHER',
            accuracyScore: nullableScore(
              candidate.accuracy_score,
              `pronunciation.error_items[${index}].accuracy_score`
            ),
            segment: integer(candidate.segment, `pronunciation.error_items[${index}].segment`, { minimum: 1 }),
            startMs: finiteNumber(candidate.start_ms, `pronunciation.error_items[${index}].start_ms`, {
              minimum: 0, nullable: true,
            }),
            endMs: finiteNumber(candidate.end_ms, `pronunciation.error_items[${index}].end_ms`, {
              minimum: 0, nullable: true,
            }),
          };
        })
        : [],
    },
    prosody: {
      unexpectedBreakCount: integer(prosody.unexpected_break_count, 'prosody.unexpected_break_count', {
        minimum: 0,
      }),
      missingBreakCount: integer(prosody.missing_break_count, 'prosody.missing_break_count', { minimum: 0 }),
      longestPauseMs: finiteNumber(prosody.longest_pause_ms, 'prosody.longest_pause_ms', {
        minimum: 0,
        nullable: true,
      }),
      monotoneSegmentCount: integer(prosody.monotone_segment_count, 'prosody.monotone_segment_count', {
        minimum: 0,
      }),
      monotoneSegmentRatio: nullableRatio(prosody.monotone_segment_ratio, 'prosody.monotone_segment_ratio'),
    },
    timing: {
      audioDurationSeconds: finiteNumber(timing.audio_duration_seconds, 'timing.audio_duration_seconds', {
        minimum: 0,
        nullable: true,
      }),
      recognizedDurationMs: finiteNumber(timing.recognized_duration_ms, 'timing.recognized_duration_ms', {
        minimum: 0, nullable: true,
      }),
      speechRateWpm: finiteNumber(timing.speech_rate_wpm, 'timing.speech_rate_wpm', {
        minimum: 0, nullable: true,
      }),
    },
    flags: Array.isArray(payload.flags) ? payload.flags.map(text).filter(Boolean) : [],
  };
}

module.exports = {
  READ_ALOUD_SPEECH_EVIDENCE_SCHEMA_VERSION,
  EVIDENCE_STATUSES,
  LISTENER_EFFORT_LEVELS,
  SEVERITY_LEVELS,
  buildReadAloudEvidenceRequest,
  normalizeReadAloudSpeechEvidence,
};
