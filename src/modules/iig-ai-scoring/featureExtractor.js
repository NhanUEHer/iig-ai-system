const { fingerprint } = require('./scoringPlan');
const { CONTRACTS } = require('./evidenceContractRegistry');

const FEATURE_SCHEMA_VERSION = 2;

const SPEAKING_TYPES = new Set([
  'READ_TEXT_ALOUD',
  'DESCRIBE_PICTURE',
  'RESPOND_TO_QUESTIONS',
  'RESPOND_USING_INFORMATION',
  'EXPRESS_AN_OPINION',
]);

const WRITING_TYPES = new Set([
  'WRITE_SENTENCE_PICTURE',
  'RESPOND_TO_WRITTEN_REQUEST',
  'WRITE_OPINION_ESSAY',
]);

const TASK_EVIDENCE_PROFILE_BY_SCORER_TYPE = Object.freeze({
  READ_TEXT_ALOUD: 'READ_ALOUD',
  DESCRIBE_PICTURE: 'DESCRIBE_PICTURE',
  RESPOND_TO_QUESTIONS: 'RESPOND_TO_QUESTIONS',
  RESPOND_USING_INFORMATION: 'RESPOND_USING_INFORMATION',
  EXPRESS_AN_OPINION: 'EXPRESS_AN_OPINION',
  WRITE_SENTENCE_PICTURE: 'WRITE_SENTENCE_PICTURE',
  RESPOND_TO_WRITTEN_REQUEST: 'RESPOND_TO_WRITTEN_REQUEST',
  WRITE_OPINION_ESSAY: 'WRITE_OPINION_ESSAY',
});

const FILLERS = new Set(['ah', 'eh', 'er', 'hmm', 'uh', 'um']);

function text(value) {
  return String(value || '').normalize('NFKC').trim();
}

function words(value) {
  return (text(value).toLowerCase().match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || [])
    .map(word => word.replace(/’/g, "'"));
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rounded(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? rounded(numerator / denominator) : 0;
}

function sentenceCount(value) {
  const normalized = text(value);
  if (!normalized) return 0;
  return normalized.split(/[.!?]+(?:\s+|$)/u).filter(part => part.trim()).length || 1;
}

function paragraphCount(value) {
  const normalized = text(value);
  return normalized ? normalized.split(/\n\s*\n/u).filter(Boolean).length : 0;
}

function repetitionCount(tokens) {
  let count = 0;
  for (let index = 1; index < tokens.length; index += 1) {
    if (tokens[index] === tokens[index - 1]) count += 1;
  }
  return count;
}

function sequenceAlignment(referenceTokens, responseTokens) {
  const rows = referenceTokens.length + 1;
  const columns = responseTokens.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(columns));
  matrix[0][0] = { cost: 0, matches: 0, substitutions: 0, omissions: 0, insertions: 0 };
  for (let row = 1; row < rows; row += 1) {
    matrix[row][0] = { cost: row, matches: 0, substitutions: 0, omissions: row, insertions: 0 };
  }
  for (let column = 1; column < columns; column += 1) {
    matrix[0][column] = { cost: column, matches: 0, substitutions: 0, omissions: 0, insertions: column };
  }

  function choose(candidates) {
    return candidates.sort((left, right) => (
      left.cost - right.cost
      || right.matches - left.matches
      || left.substitutions - right.substitutions
      || left.omissions - right.omissions
      || left.insertions - right.insertions
    ))[0];
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const same = referenceTokens[row - 1] === responseTokens[column - 1];
      const diagonal = matrix[row - 1][column - 1];
      const omission = matrix[row - 1][column];
      const insertion = matrix[row][column - 1];
      matrix[row][column] = choose([
        {
          ...diagonal,
          cost: diagonal.cost + (same ? 0 : 1),
          matches: diagonal.matches + (same ? 1 : 0),
          substitutions: diagonal.substitutions + (same ? 0 : 1),
        },
        { ...omission, cost: omission.cost + 1, omissions: omission.omissions + 1 },
        { ...insertion, cost: insertion.cost + 1, insertions: insertion.insertions + 1 },
      ]);
    }
  }
  return matrix[rows - 1][columns - 1];
}

function responseFeatures(responseText, durationSeconds) {
  const tokens = words(responseText);
  const unique = new Set(tokens);
  const duration = finiteNumber(durationSeconds);
  return {
    wordCount: tokens.length,
    characterCount: text(responseText).length,
    sentenceCount: sentenceCount(responseText),
    paragraphCount: paragraphCount(responseText),
    uniqueWordCount: unique.size,
    lexicalDiversity: ratio(unique.size, tokens.length),
    averageWordsPerSentence: ratio(tokens.length, sentenceCount(responseText)),
    fillerCount: tokens.filter(token => FILLERS.has(token)).length,
    consecutiveRepetitionCount: repetitionCount(tokens),
    durationSeconds: duration,
    wordsPerMinute: duration && duration > 0 ? rounded((tokens.length * 60) / duration, 3) : null,
  };
}

function audioQualityFeatures(audio) {
  const quality = audio?.quality || {};
  return {
    durationSeconds: finiteNumber(audio?.durationSeconds),
    meanVolumeDb: finiteNumber(quality.meanVolumeDb),
    maxVolumeDb: finiteNumber(quality.maxVolumeDb),
    silenceDurationSeconds: finiteNumber(quality.silenceDurationSeconds),
    silenceRatio: finiteNumber(quality.silenceRatio),
    cleanupMethod: text(quality.cleanupMethod) || null,
  };
}

function evidenceRequirements(scorerType) {
  const speaking = SPEAKING_TYPES.has(scorerType);
  // Dedicated progressive Dify question workflows perform the semantic and
  // delivery assessment for Q1-Q11. Keeping these stages NOT_REQUIRED avoids
  // dispatching the unfinished generic evidence-provider path before scoring.
  if ([
    'READ_TEXT_ALOUD',
    'DESCRIBE_PICTURE',
    'RESPOND_TO_QUESTIONS',
    'RESPOND_USING_INFORMATION',
    'EXPRESS_AN_OPINION',
  ].includes(scorerType)) {
    return {
      deterministic: 'READY',
      speech: 'NOT_REQUIRED',
      taskSemantic: 'NOT_REQUIRED',
    };
  }
  return {
    deterministic: 'READY',
    speech: speaking ? 'PENDING' : 'NOT_REQUIRED',
    taskSemantic: 'PENDING',
  };
}

function rtaFeatures(referenceText, transcript) {
  const referenceTokens = words(referenceText);
  const responseTokens = words(transcript);
  const alignment = sequenceAlignment(referenceTokens, responseTokens);
  return {
    referenceWordCount: referenceTokens.length,
    responseWordCount: responseTokens.length,
    matches: alignment.matches,
    substitutions: alignment.substitutions,
    omissions: alignment.omissions,
    insertions: alignment.insertions,
    editDistance: alignment.cost,
    wordCoverage: ratio(alignment.matches, referenceTokens.length),
    alignmentRatio: rounded(1 - (alignment.cost / Math.max(referenceTokens.length, responseTokens.length, 1))),
  };
}

function extractFeatures({ aiInput, transcript, featureVersion }) {
  if (!aiInput || typeof aiInput !== 'object' || Array.isArray(aiInput)) {
    throw Object.assign(new Error('Feature extraction requires canonical AI input.'), {
      code: 'IIG_AI_FEATURE_INPUT_MISSING', retryable: false,
    });
  }
  const scorerType = text(aiInput.question?.scorerType).toUpperCase();
  const speaking = SPEAKING_TYPES.has(scorerType);
  const writing = WRITING_TYPES.has(scorerType);
  if (!speaking && !writing) {
    throw Object.assign(new Error(`Unsupported feature profile: ${scorerType || '(empty)'}.`), {
      code: 'IIG_AI_FEATURE_PROFILE_UNSUPPORTED', retryable: false,
    });
  }
  const responseText = speaking ? text(transcript) : text(aiInput.response?.text);
  const businessZeroReason = text(aiInput.businessZeroReason).toUpperCase();
  if (!responseText && !businessZeroReason) {
    throw Object.assign(new Error('Feature extraction requires a non-empty candidate response.'), {
      code: 'IIG_AI_FEATURE_RESPONSE_MISSING', retryable: false,
    });
  }
  const version = text(featureVersion);
  if (!version) {
    throw Object.assign(new Error('A feature version is required.'), {
      code: 'IIG_AI_FEATURE_VERSION_MISSING', retryable: false,
    });
  }
  const question = aiInput.question || {};
  const audio = speaking ? aiInput.response?.audio : null;
  const durationSeconds = audio?.durationSeconds;
  const taskProfile = TASK_EVIDENCE_PROFILE_BY_SCORER_TYPE[scorerType];
  const evidenceContract = CONTRACTS[scorerType] || null;
  const features = {
    schemaVersion: FEATURE_SCHEMA_VERSION,
    featureVersion: version,
    scorerType,
    modality: speaking ? 'SPEAKING' : 'WRITING',
    evidenceContract: evidenceContract ? {
      contractVersion: evidenceContract.contractVersion,
      officialScoreMode: evidenceContract.officialScoreMode,
      officialScale: [...evidenceContract.officialScale],
      officialTraits: evidenceContract.officialTraits.map(trait => trait.key),
      requiredEvidenceFamilies: [...evidenceContract.requiredEvidenceFamilies],
      auxiliaryEvidenceFamilies: [...evidenceContract.auxiliaryEvidenceFamilies],
    } : null,
    completion: evidenceRequirements(scorerType),
    common: {
      response: responseFeatures(responseText, durationSeconds),
      prompt: {
        questionWordCount: words(question.questionText).length,
        promptWordCount: words(question.promptText).length,
        contextWordCount: words(question.contextText).length,
      },
      audioQuality: speaking ? audioQualityFeatures(audio) : null,
    },
    task: {
      profile: taskProfile,
      deterministic: {
        rtaAlignment: scorerType === 'READ_TEXT_ALOUD'
          ? rtaFeatures(question.contextText, responseText)
          : null,
      },
      semantic: null,
      businessZeroReason: businessZeroReason || null,
    },
    speech: null,
  };
  return {
    features,
    inputFingerprint: fingerprint({
      schemaVersion: FEATURE_SCHEMA_VERSION,
      featureVersion: version,
      scorerType,
      evidenceContractVersion: evidenceContract?.contractVersion || null,
      questionText: question.questionText || null,
      promptText: question.promptText || null,
      contextText: question.contextText || null,
      contextImageChecksums: (aiInput.media?.contextImages || [])
        .map(image => image.checksumSha256 || null),
      responseText,
      durationSeconds: finiteNumber(durationSeconds),
      audioChecksum: audio?.checksumSha256 || null,
      audioQuality: speaking ? audioQualityFeatures(audio) : null,
    }),
  };
}

module.exports = {
  FEATURE_SCHEMA_VERSION,
  SPEAKING_TYPES,
  WRITING_TYPES,
  TASK_EVIDENCE_PROFILE_BY_SCORER_TYPE,
  words,
  sequenceAlignment,
  responseFeatures,
  audioQualityFeatures,
  evidenceRequirements,
  rtaFeatures,
  extractFeatures,
};
