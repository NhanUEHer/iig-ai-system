const { fingerprint } = require('./scoringPlan');
const { getEvidenceContract } = require('./evidenceContractRegistry');

const EVIDENCE_SCHEMA_VERSION = 2;
const AGGREGATION_VERSION = 'azure-continuous-rta-v1';
const LOW_ACCURACY_THRESHOLD = 60;
const SEVERE_ACCURACY_THRESHOLD = 40;
const BREAK_CONFIDENCE_THRESHOLD = 0.75;

function failure(message, code) {
  return Object.assign(new Error(message), { code, retryable: false });
}

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rounded(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? rounded(numerator / denominator) : 0;
}

function mean(values) {
  const numbers = values.map(finite).filter(Number.isFinite);
  return numbers.length ? rounded(numbers.reduce((sum, value) => sum + value, 0) / numbers.length) : null;
}

function clampScore(value) {
  return rounded(Math.max(0, Math.min(100, Number(value) || 0)), 3);
}

function best(segment) {
  return Array.isArray(segment?.NBest) && segment.NBest[0] ? segment.NBest[0] : {};
}

function normalizeAlignment(value) {
  const alignment = value && typeof value === 'object' ? value : {};
  const integer = key => Math.max(0, Number.parseInt(alignment[key], 10) || 0);
  const referenceWordCount = integer('reference_word_count');
  const responseWordCount = integer('response_word_count');
  const matches = integer('matches');
  const substitutions = integer('substitutions');
  const omissions = integer('omissions');
  const insertions = integer('insertions');
  if (!referenceWordCount) {
    throw failure('RTA evidence requires a non-empty deterministic alignment.', 'IIG_AI_RTA_ALIGNMENT_MISSING');
  }
  return {
    reference_word_count: referenceWordCount,
    response_word_count: responseWordCount,
    matches,
    substitutions,
    omissions,
    insertions,
    exact_match_ratio: ratio(matches, referenceWordCount),
    completeness_ratio: ratio(Math.max(0, referenceWordCount - omissions), referenceWordCount),
    insertion_ratio: ratio(insertions, Math.max(responseWordCount, 1)),
    alignment_ratio: finite(alignment.alignment_ratio),
  };
}

function azurePronunciationScore(scores) {
  const available = [scores.accuracy, scores.fluency, scores.completeness, scores.prosody]
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (available.length === 4) {
    return rounded((available[0] * 0.4) + available.slice(1).reduce((sum, score) => sum + (score * 0.2), 0), 3);
  }
  if (available.length === 3) {
    return rounded((available[0] * 0.6) + available.slice(1).reduce((sum, score) => sum + (score * 0.2), 0), 3);
  }
  return available.length ? rounded(mean(available), 3) : null;
}

function normalizeAzureEvidence({ rawOutput, request }) {
  if (!rawOutput || rawOutput.schemaVersion !== 'azure-rta-raw-v1' || !Array.isArray(rawOutput.segments)) {
    throw failure('Completed RTA transcription has no compatible Azure raw evidence.', 'IIG_AI_RTA_AZURE_RAW_MISSING');
  }
  if (!rawOutput.segments.length) {
    throw failure('Azure raw evidence contains no recognized segment.', 'IIG_AI_RTA_AZURE_SEGMENTS_EMPTY');
  }
  const contract = getEvidenceContract('READ_TEXT_ALOUD');
  const alignment = normalizeAlignment(request.deterministic_alignment);
  const words = [];
  const segmentScores = [];
  const monotoneSegments = new Set();
  let unexpectedBreakCount = 0;
  let missingBreakCount = 0;
  let longestPauseMs = 0;

  rawOutput.segments.forEach((segment, segmentIndex) => {
    const hypothesis = best(segment);
    const assessment = hypothesis.PronunciationAssessment || {};
    segmentScores.push({
      accuracy: finite(assessment.AccuracyScore),
      fluency: finite(assessment.FluencyScore),
      completeness: finite(assessment.CompletenessScore),
      prosody: finite(assessment.ProsodyScore),
      pronunciation: finite(assessment.PronScore),
    });
    for (const word of hypothesis.Words || []) {
      const wordAssessment = word.PronunciationAssessment || {};
      const accuracy = finite(wordAssessment.AccuracyScore);
      const errorType = accuracy !== null && accuracy < LOW_ACCURACY_THRESHOLD
        ? 'Mispronunciation'
        : (wordAssessment.ErrorType || 'None');
      const prosody = wordAssessment.Feedback?.Prosody || {};
      const breakFeedback = prosody.Break || {};
      const unexpectedConfidence = finite(breakFeedback.UnexpectedBreak?.Confidence);
      const missingConfidence = finite(breakFeedback.MissingBreak?.Confidence);
      const pauseMs = Math.max(0, (finite(breakFeedback.BreakLength) || 0) / 10000);
      if (unexpectedConfidence !== null && unexpectedConfidence >= BREAK_CONFIDENCE_THRESHOLD) {
        unexpectedBreakCount += 1;
      }
      if (missingConfidence !== null && missingConfidence >= BREAK_CONFIDENCE_THRESHOLD) {
        missingBreakCount += 1;
      }
      longestPauseMs = Math.max(longestPauseMs, pauseMs);
      if ((prosody.Intonation?.ErrorTypes || []).includes('Monotone')) monotoneSegments.add(segmentIndex);
      words.push({
        word: String(word.Word || '').trim().toLowerCase(),
        segment: segmentIndex + 1,
        offset: finite(word.Offset),
        duration: finite(word.Duration),
        accuracy,
        errorType,
        phonemeScores: (word.Phonemes || [])
          .map(phoneme => finite(phoneme.PronunciationAssessment?.AccuracyScore))
          .filter(Number.isFinite),
      });
    }
  });

  if (!words.length) {
    throw failure('Azure raw evidence contains no assessed word.', 'IIG_AI_RTA_AZURE_WORDS_EMPTY');
  }
  const nonInsertions = words.filter(word => word.errorType !== 'Insertion');
  const correctlyPronounced = nonInsertions.filter(word => word.errorType === 'None');
  const mispronounced = nonInsertions.filter(word => word.errorType === 'Mispronunciation');
  const wordScores = nonInsertions.map(word => word.accuracy).filter(Number.isFinite);
  const phonemeScores = nonInsertions.flatMap(word => word.phonemeScores);
  const startOffset = Math.min(...words.map(word => word.offset).filter(Number.isFinite));
  const endOffset = Math.max(...words.map(word => (
    Number.isFinite(word.offset) && Number.isFinite(word.duration) ? word.offset + word.duration : 0
  )));
  const recognizedDurationMs = endOffset > startOffset ? (endOffset - startOffset) / 10000 : 0;
  const fluentDuration = correctlyPronounced.reduce((sum, word) => sum + (word.duration || 0), 0);
  const continuousScores = {
    accuracy: mean(wordScores),
    fluency: recognizedDurationMs > 0 ? clampScore((fluentDuration / (endOffset - startOffset)) * 100) : null,
    completeness: rounded(alignment.completeness_ratio * 100, 3),
    prosody: mean(segmentScores.map(score => score.prosody)),
  };
  continuousScores.pronunciation = azurePronunciationScore(continuousScores);
  const durationSeconds = finite(request.audio?.duration_seconds);

  return {
    schema_version: EVIDENCE_SCHEMA_VERSION,
    contract_version: contract.contractVersion,
    status: 'SUCCESS',
    validity: {
      speech_present: true,
      language_code: 'en',
      task_related: alignment.alignment_ratio === null || alignment.alignment_ratio >= 0.25,
    },
    source: {
      provider: 'azure-ai-speech',
      raw_schema_version: rawOutput.schemaVersion,
      aggregation_version: AGGREGATION_VERSION,
      segment_count: rawOutput.segments.length,
      low_accuracy_threshold: LOW_ACCURACY_THRESHOLD,
      break_confidence_threshold: BREAK_CONFIDENCE_THRESHOLD,
    },
    alignment,
    azure_scores: {
      continuous: continuousScores,
      segment_mean: {
        accuracy: mean(segmentScores.map(score => score.accuracy)),
        fluency: mean(segmentScores.map(score => score.fluency)),
        completeness: mean(segmentScores.map(score => score.completeness)),
        prosody: mean(segmentScores.map(score => score.prosody)),
        pronunciation: mean(segmentScores.map(score => score.pronunciation)),
      },
    },
    pronunciation: {
      assessed_word_count: nonInsertions.length,
      correctly_pronounced_word_count: correctlyPronounced.length,
      mispronunciation_count: mispronounced.length,
      mispronunciation_ratio: ratio(mispronounced.length, nonInsertions.length),
      low_accuracy_word_count: wordScores.filter(score => score < LOW_ACCURACY_THRESHOLD).length,
      low_accuracy_word_ratio: ratio(
        wordScores.filter(score => score < LOW_ACCURACY_THRESHOLD).length,
        wordScores.length
      ),
      severe_accuracy_word_count: wordScores.filter(score => score < SEVERE_ACCURACY_THRESHOLD).length,
      severe_accuracy_word_ratio: ratio(
        wordScores.filter(score => score < SEVERE_ACCURACY_THRESHOLD).length,
        wordScores.length
      ),
      mean_word_accuracy: mean(wordScores),
      mean_phoneme_accuracy: mean(phonemeScores),
      low_accuracy_phoneme_ratio: ratio(
        phonemeScores.filter(score => score < LOW_ACCURACY_THRESHOLD).length,
        phonemeScores.length
      ),
      error_items: mispronounced.map(word => ({
        observed: word.word || null,
        category: 'MISPRONUNCIATION',
        accuracy_score: word.accuracy,
        segment: word.segment,
        start_ms: Number.isFinite(word.offset) ? rounded(word.offset / 10000, 3) : null,
        end_ms: Number.isFinite(word.offset) && Number.isFinite(word.duration)
          ? rounded((word.offset + word.duration) / 10000, 3)
          : null,
      })),
    },
    prosody: {
      unexpected_break_count: unexpectedBreakCount,
      missing_break_count: missingBreakCount,
      longest_pause_ms: rounded(longestPauseMs, 3),
      monotone_segment_count: monotoneSegments.size,
      monotone_segment_ratio: ratio(monotoneSegments.size, rawOutput.segments.length),
    },
    timing: {
      audio_duration_seconds: durationSeconds,
      recognized_duration_ms: rounded(recognizedDurationMs, 3),
      speech_rate_wpm: durationSeconds && durationSeconds > 0
        ? rounded((alignment.response_word_count * 60) / durationSeconds, 3)
        : null,
    },
    flags: alignment.alignment_ratio !== null && alignment.alignment_ratio < 0.25
      ? ['LOW_REFERENCE_ALIGNMENT']
      : [],
  };
}

const provider = {
  describe() {
    return {
      provider: 'LOCAL_DETERMINISTIC',
      modelName: 'azure-rta-evidence-normalizer',
      modelVersion: AGGREGATION_VERSION,
      promptVersion: null,
    };
  },

  async analyze({ request, task }) {
    const startedAt = Date.now();
    const output = normalizeAzureEvidence({ rawOutput: task.answerSttRawOutput, request });
    return {
      output,
      responseHash: fingerprint(output),
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
      latencyMs: Date.now() - startedAt,
      estimatedCostUsd: 0,
      providerRequestId: task.answerSttProviderRequestId || null,
    };
  },
};

module.exports = {
  EVIDENCE_SCHEMA_VERSION,
  AGGREGATION_VERSION,
  LOW_ACCURACY_THRESHOLD,
  BREAK_CONFIDENCE_THRESHOLD,
  normalizeAzureEvidence,
  provider,
};
