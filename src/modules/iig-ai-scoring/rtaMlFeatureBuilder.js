const { fingerprint } = require('./scoringPlan');
const { READ_ALOUD_EVIDENCE_CONTRACT_VERSION } = require('./evidenceContractRegistry');

const RTA_ML_FEATURE_SCHEMA_VERSION = 1;
const RTA_ML_FEATURE_VERSION = 'rta-ml-features-v1';
const WRONG_PASSAGE_CONTENT_COVERAGE_THRESHOLD = 0.5;
const HEAVY_MISPRONUNCIATION_THRESHOLD = 40;

const FUNCTION_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by', 'can', 'could',
  'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'hers', 'him', 'his',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'may', 'might', 'my', 'nor', 'not', 'of', 'on',
  'or', 'our', 'ours', 'she', 'should', 'so', 'than', 'that', 'the', 'their', 'theirs', 'them',
  'then', 'there', 'these', 'they', 'this', 'those', 'to', 'us', 'was', 'we', 'were', 'what',
  'when', 'where', 'which', 'who', 'will', 'with', 'would', 'you', 'your', 'yours',
]);

const FILLERS = new Set(['ah', 'eh', 'er', 'hmm', 'uh', 'um']);

const RTA_ML_FEATURE_NAMES = Object.freeze([
  'azure_accuracy',
  'azure_fluency',
  'azure_completeness',
  'azure_prosody',
  'azure_pronunciation',
  'azure_segment_accuracy_mean',
  'azure_segment_fluency_mean',
  'azure_segment_completeness_mean',
  'azure_segment_prosody_mean',
  'alignment_ratio',
  'exact_match_ratio',
  'completion_ratio',
  'insertion_ratio',
  'content_word_coverage',
  'content_word_alignment_error_ratio',
  'content_word_pronunciation_error_ratio',
  'proper_noun_alignment_error_count',
  'proper_noun_pronunciation_error_count',
  'suffix_slip_count',
  'mispronunciation_ratio',
  'low_accuracy_word_ratio',
  'severe_accuracy_word_ratio',
  'mean_word_accuracy',
  'mean_phoneme_accuracy',
  'low_accuracy_phoneme_ratio',
  'unexpected_break_ratio',
  'missing_break_ratio',
  'monotone_segment_ratio',
  'longest_pause_seconds',
  'speech_rate_wpm',
  'recognized_audio_ratio',
  'initial_hesitation_seconds',
  'filler_ratio',
  'consecutive_repetition_ratio',
  'reference_word_count',
  'response_word_count',
  'audio_duration_seconds',
  'silence_ratio',
]);

function permanentError(message, code) {
  return Object.assign(new Error(message), { code, retryable: false });
}

function text(value) {
  return String(value || '').normalize('NFKC').trim();
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

function tokenize(value) {
  const source = text(value);
  const expression = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;
  const tokens = [];
  let match;
  while ((match = expression.exec(source))) {
    const surface = match[0].replace(/’/g, "'");
    const prefix = source.slice(0, match.index);
    tokens.push({
      surface,
      normalized: surface.toLowerCase(),
      index: tokens.length,
      sentenceStart: tokens.length === 0 || /[.!?]\s*$/u.test(prefix.slice(tokens.at(-1)?.end || 0)),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

function isTitleCase(value) {
  return /^\p{Lu}[\p{L}\p{N}'’-]*$/u.test(value) || /^\p{Lu}{2,}[\p{L}\p{N}'’-]*$/u.test(value);
}

function properNounIndexes(tokens) {
  const result = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!isTitleCase(token.surface)) continue;
    const previousTitle = index > 0
      && !token.sentenceStart
      && isTitleCase(tokens[index - 1].surface);
    const nextTitle = index + 1 < tokens.length
      && !tokens[index + 1].sentenceStart
      && isTitleCase(tokens[index + 1].surface);
    if (!token.sentenceStart || previousTitle || nextTitle) result.add(index);
  }
  return result;
}

function align(referenceTokens, responseTokens) {
  const rows = referenceTokens.length + 1;
  const columns = responseTokens.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(columns));
  matrix[0][0] = { cost: 0, matches: 0, previous: null, operation: null };
  for (let row = 1; row < rows; row += 1) {
    matrix[row][0] = {
      cost: row, matches: 0, previous: [row - 1, 0], operation: 'OMISSION',
    };
  }
  for (let column = 1; column < columns; column += 1) {
    matrix[0][column] = {
      cost: column, matches: 0, previous: [0, column - 1], operation: 'INSERTION',
    };
  }
  function choose(candidates) {
    return candidates.sort((left, right) => (
      left.cost - right.cost
      || right.matches - left.matches
      || left.priority - right.priority
    ))[0];
  }
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const same = referenceTokens[row - 1].normalized === responseTokens[column - 1].normalized;
      const diagonal = matrix[row - 1][column - 1];
      const omission = matrix[row - 1][column];
      const insertion = matrix[row][column - 1];
      matrix[row][column] = choose([
        {
          cost: diagonal.cost + (same ? 0 : 1),
          matches: diagonal.matches + (same ? 1 : 0),
          previous: [row - 1, column - 1],
          operation: same ? 'MATCH' : 'SUBSTITUTION',
          priority: 0,
        },
        {
          cost: omission.cost + 1,
          matches: omission.matches,
          previous: [row - 1, column],
          operation: 'OMISSION',
          priority: 1,
        },
        {
          cost: insertion.cost + 1,
          matches: insertion.matches,
          previous: [row, column - 1],
          operation: 'INSERTION',
          priority: 2,
        },
      ]);
    }
  }
  const operations = [];
  let row = referenceTokens.length;
  let column = responseTokens.length;
  while (row > 0 || column > 0) {
    const cell = matrix[row][column];
    const [previousRow, previousColumn] = cell.previous;
    operations.push({
      type: cell.operation,
      reference: row > previousRow ? referenceTokens[row - 1] : null,
      response: column > previousColumn ? responseTokens[column - 1] : null,
    });
    row = previousRow;
    column = previousColumn;
  }
  return operations.reverse();
}

function isContentWord(token) {
  return token && !FUNCTION_WORDS.has(token.normalized);
}

function isSuffixSlip(expected, observed) {
  if (!expected || !observed || expected === observed) return false;
  const variants = new Set();
  if (expected.endsWith('s') && expected.length > 2) variants.add(expected.slice(0, -1));
  if (expected.endsWith('es') && expected.length > 3) variants.add(expected.slice(0, -2));
  if (expected.endsWith('ed') && expected.length > 3) variants.add(expected.slice(0, -2));
  if (expected.endsWith('d') && expected.length > 2) variants.add(expected.slice(0, -1));
  return variants.has(observed);
}

function consecutiveRepetitionCount(tokens) {
  let count = 0;
  for (let index = 1; index < tokens.length; index += 1) {
    if (tokens[index].normalized === tokens[index - 1].normalized) count += 1;
  }
  return count;
}

function firstAzureWordOffsetMs(rawOutput) {
  const offsets = [];
  for (const segment of rawOutput?.segments || []) {
    for (const word of segment?.NBest?.[0]?.Words || []) {
      const offset = finite(word.Offset);
      if (offset !== null) offsets.push(offset / 10000);
    }
  }
  return offsets.length ? Math.min(...offsets) : null;
}

function requiredNumber(value, field) {
  const parsed = finite(value);
  if (parsed === null) {
    throw permanentError(`RTA ML feature ${field} is missing.`, 'IIG_AI_RTA_ML_FEATURE_MISSING');
  }
  return parsed;
}

function validateInput({ aiInput, transcript, features, azureRawOutput }) {
  if (text(aiInput?.question?.scorerType).toUpperCase() !== 'READ_TEXT_ALOUD') {
    throw permanentError('RTA ML features require READ_TEXT_ALOUD input.', 'IIG_AI_RTA_ML_INPUT_INVALID');
  }
  if (!text(aiInput?.question?.contextText) || !text(transcript)) {
    throw permanentError('RTA ML features require passage and transcript.', 'IIG_AI_RTA_ML_INPUT_INVALID');
  }
  if (features?.evidenceContract?.contractVersion !== READ_ALOUD_EVIDENCE_CONTRACT_VERSION
    || features?.completion?.speech !== 'READY'
    || features?.speech?.status !== 'SUCCESS') {
    throw permanentError('RTA evidence is not ML-ready.', 'IIG_AI_RTA_ML_EVIDENCE_NOT_READY');
  }
  if (azureRawOutput?.schemaVersion !== 'azure-rta-raw-v1') {
    throw permanentError('RTA ML features require Azure raw timing evidence.', 'IIG_AI_RTA_ML_AZURE_RAW_MISSING');
  }
}

function buildRtaMlFeatures({ aiInput, transcript, features, azureRawOutput }) {
  validateInput({ aiInput, transcript, features, azureRawOutput });
  const passageTokens = tokenize(aiInput.question.contextText);
  const responseTokens = tokenize(transcript);
  const operations = align(passageTokens, responseTokens);
  const properIndexes = properNounIndexes(passageTokens);
  const contentIndexes = new Set(passageTokens.filter(isContentWord).map(token => token.index));
  const alignedContentIndexes = new Set();
  const contentErrorIndexes = new Set();
  const properAlignmentErrorIndexes = new Set();
  let suffixSlipCount = 0;

  for (const operation of operations) {
    const referenceIndex = operation.reference?.index;
    if (operation.type === 'MATCH' && contentIndexes.has(referenceIndex)) alignedContentIndexes.add(referenceIndex);
    if (['OMISSION', 'SUBSTITUTION'].includes(operation.type) && contentIndexes.has(referenceIndex)) {
      contentErrorIndexes.add(referenceIndex);
    }
    if (['OMISSION', 'SUBSTITUTION'].includes(operation.type) && properIndexes.has(referenceIndex)) {
      properAlignmentErrorIndexes.add(referenceIndex);
    }
    if (operation.type === 'SUBSTITUTION'
      && isSuffixSlip(operation.reference?.normalized, operation.response?.normalized)) {
      suffixSlipCount += 1;
    }
  }

  const speech = features.speech;
  const alignment = speech.alignment;
  const pronunciation = speech.pronunciation;
  const prosody = speech.prosody;
  const timing = speech.timing;
  const audioQuality = features.common?.audioQuality || {};
  const pronunciationErrors = pronunciation.errorItems || [];
  const properWords = new Set([...properIndexes].map(index => passageTokens[index].normalized));
  const contentWords = new Set([...contentIndexes].map(index => passageTokens[index].normalized));
  const properPronunciationErrors = pronunciationErrors.filter(item => (
    properWords.has(text(item.observed).toLowerCase())
      && finite(item.accuracyScore) !== null
      && finite(item.accuracyScore) < HEAVY_MISPRONUNCIATION_THRESHOLD
  ));
  const contentPronunciationErrors = pronunciationErrors.filter(item => contentWords.has(text(item.observed).toLowerCase()));
  const contentWordCoverage = ratio(alignedContentIndexes.size, contentIndexes.size);
  const completionRatio = requiredNumber(alignment.completenessRatio, 'alignment.completenessRatio');
  const assessedWordCount = requiredNumber(pronunciation.assessedWordCount, 'pronunciation.assessedWordCount');
  const segmentCount = requiredNumber(speech.source?.segmentCount, 'source.segmentCount');
  const audioDurationSeconds = requiredNumber(timing.audioDurationSeconds, 'timing.audioDurationSeconds');
  const initialHesitationMs = firstAzureWordOffsetMs(azureRawOutput);
  const fillerCount = responseTokens.filter(token => FILLERS.has(token.normalized)).length;
  const repetitionCount = consecutiveRepetitionCount(responseTokens);

  const values = {
    azure_accuracy: requiredNumber(speech.azureScores?.continuous?.accuracy, 'azureScores.continuous.accuracy'),
    azure_fluency: requiredNumber(speech.azureScores?.continuous?.fluency, 'azureScores.continuous.fluency'),
    azure_completeness: requiredNumber(speech.azureScores?.continuous?.completeness, 'azureScores.continuous.completeness'),
    azure_prosody: requiredNumber(speech.azureScores?.continuous?.prosody, 'azureScores.continuous.prosody'),
    azure_pronunciation: requiredNumber(speech.azureScores?.continuous?.pronunciation, 'azureScores.continuous.pronunciation'),
    azure_segment_accuracy_mean: requiredNumber(speech.azureScores?.segmentMean?.accuracy, 'azureScores.segmentMean.accuracy'),
    azure_segment_fluency_mean: requiredNumber(speech.azureScores?.segmentMean?.fluency, 'azureScores.segmentMean.fluency'),
    azure_segment_completeness_mean: requiredNumber(speech.azureScores?.segmentMean?.completeness, 'azureScores.segmentMean.completeness'),
    azure_segment_prosody_mean: requiredNumber(speech.azureScores?.segmentMean?.prosody, 'azureScores.segmentMean.prosody'),
    alignment_ratio: requiredNumber(alignment.alignmentRatio, 'alignment.alignmentRatio'),
    exact_match_ratio: requiredNumber(alignment.exactMatchRatio, 'alignment.exactMatchRatio'),
    completion_ratio: completionRatio,
    insertion_ratio: requiredNumber(alignment.insertionRatio, 'alignment.insertionRatio'),
    content_word_coverage: contentWordCoverage,
    content_word_alignment_error_ratio: ratio(contentErrorIndexes.size, contentIndexes.size),
    content_word_pronunciation_error_ratio: ratio(contentPronunciationErrors.length, contentIndexes.size),
    proper_noun_alignment_error_count: properAlignmentErrorIndexes.size,
    proper_noun_pronunciation_error_count: properPronunciationErrors.length,
    suffix_slip_count: suffixSlipCount,
    mispronunciation_ratio: requiredNumber(pronunciation.mispronunciationRatio, 'pronunciation.mispronunciationRatio'),
    low_accuracy_word_ratio: requiredNumber(pronunciation.lowAccuracyWordRatio, 'pronunciation.lowAccuracyWordRatio'),
    severe_accuracy_word_ratio: requiredNumber(pronunciation.severeAccuracyWordRatio, 'pronunciation.severeAccuracyWordRatio'),
    mean_word_accuracy: requiredNumber(pronunciation.meanWordAccuracy, 'pronunciation.meanWordAccuracy'),
    mean_phoneme_accuracy: requiredNumber(pronunciation.meanPhonemeAccuracy, 'pronunciation.meanPhonemeAccuracy'),
    low_accuracy_phoneme_ratio: requiredNumber(pronunciation.lowAccuracyPhonemeRatio, 'pronunciation.lowAccuracyPhonemeRatio'),
    unexpected_break_ratio: ratio(prosody.unexpectedBreakCount, assessedWordCount),
    missing_break_ratio: ratio(prosody.missingBreakCount, assessedWordCount),
    monotone_segment_ratio: requiredNumber(prosody.monotoneSegmentRatio, 'prosody.monotoneSegmentRatio'),
    longest_pause_seconds: rounded(requiredNumber(prosody.longestPauseMs, 'prosody.longestPauseMs') / 1000),
    speech_rate_wpm: requiredNumber(timing.speechRateWpm, 'timing.speechRateWpm'),
    recognized_audio_ratio: Math.min(
      1,
      ratio(requiredNumber(timing.recognizedDurationMs, 'timing.recognizedDurationMs'), audioDurationSeconds * 1000)
    ),
    initial_hesitation_seconds: initialHesitationMs === null ? 0 : rounded(initialHesitationMs / 1000),
    filler_ratio: ratio(fillerCount, responseTokens.length),
    consecutive_repetition_ratio: ratio(repetitionCount, responseTokens.length),
    reference_word_count: passageTokens.length,
    response_word_count: responseTokens.length,
    audio_duration_seconds: audioDurationSeconds,
    silence_ratio: finite(audioQuality.silenceRatio) ?? 0,
  };

  const vector = RTA_ML_FEATURE_NAMES.map(name => requiredNumber(values[name], name));
  const ruleContext = {
    wrongPassage: contentWordCoverage < WRONG_PASSAGE_CONTENT_COVERAGE_THRESHOLD,
    contentWordCoverage,
    completionRatio,
    completionBand: completionRatio < 0.67
      ? 'BELOW_67'
      : (completionRatio <= 0.9 ? 'FROM_67_TO_90' : 'ABOVE_90'),
    properNounCount: properIndexes.size,
    properNounAlignmentErrorCount: properAlignmentErrorIndexes.size,
    properNounPronunciationErrorCount: properPronunciationErrors.length,
    properNounViolation: properAlignmentErrorIndexes.size + properPronunciationErrors.length > 0,
    contentWordAlignmentErrorCount: contentErrorIndexes.size,
    contentWordPronunciationErrorCount: contentPronunciationErrors.length,
    contentWordViolation: contentErrorIndexes.size >= 4,
    suffixSlipCount,
    suffixLeniencyEligible: suffixSlipCount > 0 && suffixSlipCount < 3,
    initialHesitationMs: initialHesitationMs === null ? 0 : rounded(initialHesitationMs, 3),
    initialHesitationLenient: initialHesitationMs !== null && initialHesitationMs < 3000,
    fillerCount,
    consecutiveRepetitionCount: repetitionCount,
  };

  const output = {
    schemaVersion: RTA_ML_FEATURE_SCHEMA_VERSION,
    featureVersion: RTA_ML_FEATURE_VERSION,
    evidenceContractVersion: READ_ALOUD_EVIDENCE_CONTRACT_VERSION,
    sourceFeatureVersion: features.featureVersion,
    scorerType: 'READ_TEXT_ALOUD',
    eligibleForMl: true,
    featureNames: [...RTA_ML_FEATURE_NAMES],
    values,
    vector,
    ruleContext,
  };
  return { ...output, featureFingerprint: fingerprint(output) };
}

module.exports = {
  RTA_ML_FEATURE_SCHEMA_VERSION,
  RTA_ML_FEATURE_VERSION,
  WRONG_PASSAGE_CONTENT_COVERAGE_THRESHOLD,
  HEAVY_MISPRONUNCIATION_THRESHOLD,
  RTA_ML_FEATURE_NAMES,
  tokenize,
  properNounIndexes,
  align,
  isContentWord,
  isSuffixSlip,
  buildRtaMlFeatures,
};
