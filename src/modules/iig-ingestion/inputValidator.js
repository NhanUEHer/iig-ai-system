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

const BUSINESS_ZERO_INPUT_CODES = new Set([
  'AUDIO_TOO_SHORT',
  'AUDIO_NO_SIGNAL',
  'INVALID_AUDIO',
  'STUDENT_AUDIO_MISSING',
]);

const WRITING_BUSINESS_ZERO_REASONS = Object.freeze({
  ANSWER_TEXT_MISSING: 'BLANK_RESPONSE',
});

const {
  SCORING_DISPOSITIONS,
  ZERO_ORIGINS,
  studentAudioSourceReason,
  resolution: buildResolution,
} = require('./questionResolution');

function text(value) {
  return String(value || '').trim();
}

function mediaDescriptor(asset) {
  return {
    id: asset.id,
    role: asset.asset_role,
    index: Number(asset.asset_index || 0),
    required: Boolean(asset.is_required),
    storage: {
      provider: asset.canonical_storage_provider,
      bucket: asset.canonical_storage_bucket || null,
      key: asset.canonical_storage_key,
      mimeType: asset.canonical_mime_type,
    },
    checksumSha256: asset.checksum_sha256 || null,
    durationSeconds: asset.duration_seconds == null ? null : Number(asset.duration_seconds),
    quality: asset.quality_metrics || {},
  };
}

function assetsByRole(assets) {
  const result = {};
  for (const asset of assets) {
    if (asset.status !== 'READY') continue;
    if (!result[asset.asset_role]) result[asset.asset_role] = [];
    result[asset.asset_role].push(mediaDescriptor(asset));
  }
  for (const values of Object.values(result)) values.sort((a, b) => a.index - b.index);
  return result;
}

function addError(errors, code, field, message) {
  errors.push({ code, field, message });
}

function deduplicateErrors(errors) {
  const seen = new Set();
  return errors.filter(error => {
    const key = [
      error?.code || '',
      error?.field || '',
      error?.role || '',
      error?.assetId || '',
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildAiInput(row, { speaking, byRole, questionResolution }) {
  const businessZeroReason = questionResolution.scoringDisposition === SCORING_DISPOSITIONS.NORMAL
    ? null
    : (speaking ? 'NO_SPEECH' : questionResolution.zeroReason);
  const transcriptionRequired = [];
  if (!text(row.question_text) && (byRole.QUESTION_AUDIO || []).length) {
    transcriptionRequired.push({ target: 'question', assetId: byRole.QUESTION_AUDIO[0].id });
  }
  if (!text(row.context_text) && (byRole.CONTEXT_AUDIO || []).length) {
    transcriptionRequired.push({ target: 'context', assetId: byRole.CONTEXT_AUDIO[0].id });
  }
  if (speaking && !businessZeroReason) {
    transcriptionRequired.push({ target: 'student_answer', assetId: byRole.STUDENT_AUDIO[0].id });
  }
  return {
    schemaVersion: 1,
    attemptId: row.attempt_id,
    submissionId: row.submission_id,
    businessZeroReason,
    scoringDisposition: questionResolution.scoringDisposition,
    zeroReason: questionResolution.zeroReason,
    zeroOrigin: questionResolution.zeroOrigin,
    resolutionMetadata: questionResolution.metadata,
    exam: {
      mockTestId: row.source_mock_test_id,
      versionId: row.exam_version_id,
      section: row.section_type,
    },
    question: {
      id: row.exam_question_id,
      sourceQuestionId: row.source_question_id,
      number: row.question_number,
      globalNumber: Number(row.sort_order) + 1,
      scorerType: row.scorer_type,
      title: row.title || null,
      questionText: row.question_text || null,
      promptText: row.prompt_text || null,
      contextText: row.context_text || null,
      scoreGroups: row.score_groups,
    },
    response: speaking
      ? {
        type: 'audio',
        audio: businessZeroReason ? null : (byRole.STUDENT_AUDIO || [])[0] || null,
      }
      : { type: 'text', text: row.answer_text },
    media: {
      questionImages: byRole.QUESTION_IMAGE || [],
      contextImages: byRole.CONTEXT_IMAGE || [],
      questionAudio: byRole.QUESTION_AUDIO || [],
      contextAudio: byRole.CONTEXT_AUDIO || [],
    },
    transcriptionRequired,
  };
}

function validateAttempt(row) {
  const existingErrors = Array.isArray(row.validation_errors) ? row.validation_errors : [];
  if (row.readiness_status === 'REVIEW') {
    return {
      attemptId: row.attempt_id,
      scorerType: row.scorer_type,
      questionNumber: Number(row.question_number),
      status: 'REVIEW',
      errors: existingErrors.length ? existingErrors : [{
        code: 'CONTENT_TRANSCRIPTION_REVIEW_REQUIRED',
        field: 'question',
        message: 'Canonical question or context transcription requires review.',
      }],
      aiInput: null,
      resolution: buildResolution({
        scoringDisposition: SCORING_DISPOSITIONS.REVIEW_REQUIRED,
        zeroOrigin: ZERO_ORIGINS.SYSTEM,
        metadata: { validationErrors: existingErrors },
      }),
    };
  }
  if (row.readiness_status === 'INVALID_INPUT') {
    return {
      attemptId: row.attempt_id,
      scorerType: row.scorer_type,
      questionNumber: Number(row.question_number),
      status: row.readiness_status,
      errors: existingErrors.length ? existingErrors : [{
        code: row.readiness_status,
        field: 'media',
        message: 'Required media did not pass preparation.',
      }],
      aiInput: null,
      resolution: buildResolution({
        scoringDisposition: SCORING_DISPOSITIONS.INVALID_PROMPT_SOURCE,
        zeroOrigin: ZERO_ORIGINS.SOURCE_DATA,
        metadata: { validationErrors: existingErrors },
      }),
    };
  }

  const existingBusinessZero = Boolean(row.ai_input?.businessZeroReason);
  const errors = row.readiness_status === 'INVALID_AUDIO' || existingBusinessZero
    ? [...existingErrors] : [];
  const allAssets = Array.isArray(row.assets) ? row.assets : [];
  const type = row.scorer_type;
  const speaking = SPEAKING_TYPES.has(type);
  const writing = WRITING_TYPES.has(type);
  const studentAudioAssets = allAssets.filter(asset => asset.asset_role === 'STUDENT_AUDIO');
  const studentSourceFailure = existingErrors.find(error =>
    error.role === 'STUDENT_AUDIO' && error.failureOrigin === ZERO_ORIGINS.SOURCE_DATA
  );
  const candidateAudioInvalid = speaking
    && (row.readiness_status === 'INVALID_AUDIO' || existingBusinessZero || studentSourceFailure);
  const requiredAssets = allAssets.filter(asset => asset.is_required);
  for (const asset of requiredAssets) {
    if (candidateAudioInvalid && asset.asset_role === 'STUDENT_AUDIO') continue;
    if (asset.status !== 'READY') {
      addError(errors, 'REQUIRED_MEDIA_NOT_READY', `media.${asset.asset_role}`, 'Required media is not ready.');
    }
    if (!asset.canonical_storage_key) {
      addError(errors, 'REQUIRED_MEDIA_STORAGE_MISSING', `media.${asset.asset_role}`, 'Required media has no canonical storage key.');
    }
  }

  const byRole = assetsByRole(allAssets);
  if (!speaking && !writing) addError(errors, 'SCORER_TYPE_UNSUPPORTED', 'question.scorerType', 'Unsupported scorer type.');
  if (!Array.isArray(row.score_groups) || !row.score_groups.length) {
    addError(errors, 'SCORE_GROUP_MISSING', 'question.scoreGroups', 'Question is not assigned to a score group.');
  }
  if (speaking && !(byRole.STUDENT_AUDIO || []).length && !studentSourceFailure) {
    addError(errors, 'STUDENT_AUDIO_MISSING', 'response.audio', 'Speaking response requires prepared candidate audio.');
  }
  const writingZeroReason = writing && !text(row.answer_text)
    ? WRITING_BUSINESS_ZERO_REASONS.ANSWER_TEXT_MISSING
    : null;

  if (type === 'READ_TEXT_ALOUD' && !text(row.context_text)) {
    addError(errors, 'READING_PASSAGE_MISSING', 'question.contextText', 'Reading passage is missing.');
  }
  if (['DESCRIBE_PICTURE', 'WRITE_SENTENCE_PICTURE'].includes(type) && !(byRole.QUESTION_IMAGE || []).length) {
    addError(errors, 'QUESTION_IMAGE_MISSING', 'media.questionImages', 'Picture prompt is missing.');
  }
  if (type === 'RESPOND_TO_QUESTIONS' && !text(row.question_text) && !(byRole.QUESTION_AUDIO || []).length) {
    addError(errors, 'QUESTION_CONTENT_MISSING', 'question.questionText', 'Question text and question audio are both missing.');
  }
  if (type === 'RESPOND_USING_INFORMATION') {
    if (!(byRole.CONTEXT_IMAGE || []).length && !text(row.context_text)) {
      addError(errors, 'INFORMATION_CONTEXT_MISSING', 'question.context', 'Information context is missing.');
    }
    if (!text(row.question_text) && !(byRole.QUESTION_AUDIO || []).length) {
      addError(errors, 'QUESTION_CONTENT_MISSING', 'question.questionText', 'Question text and question audio are both missing.');
    }
  }
  if (type === 'RESPOND_TO_WRITTEN_REQUEST') {
    if (!text(row.question_text) && !text(row.prompt_text)) {
      addError(
        errors,
        'WRITTEN_REQUEST_DIRECTIONS_MISSING',
        'question.questionText',
        'Written-request directions are missing.'
      );
    }
    if (!text(row.context_text) && !(byRole.CONTEXT_IMAGE || []).length) {
      addError(
        errors,
        'WRITTEN_REQUEST_CONTEXT_MISSING',
        'question.context',
        'Written-request source text and context image are both missing.'
      );
    }
  }
  if (['EXPRESS_AN_OPINION', 'WRITE_OPINION_ESSAY'].includes(type) &&
      !text(row.context_text) && !text(row.question_text) && !text(row.prompt_text)) {
    addError(errors, 'PROMPT_CONTENT_MISSING', 'question.contextText', 'Scoring prompt is missing.');
  }
  let questionResolution = buildResolution();
  const persistedResolution = row.ai_input?.scoringDisposition
    ? buildResolution({
      scoringDisposition: row.ai_input.scoringDisposition,
      zeroReason: row.ai_input.zeroReason || null,
      zeroOrigin: row.ai_input.zeroOrigin || null,
      metadata: row.ai_input.resolutionMetadata || {},
    })
    : null;
  if (persistedResolution) {
    questionResolution = persistedResolution;
  } else if (writingZeroReason) {
    questionResolution = buildResolution({
      scoringDisposition: SCORING_DISPOSITIONS.ZERO_CANDIDATE,
      zeroReason: writingZeroReason,
      zeroOrigin: ZERO_ORIGINS.CANDIDATE,
      metadata: { responsePresent: false },
    });
  } else if (speaking && studentSourceFailure) {
    questionResolution = buildResolution({
      scoringDisposition: SCORING_DISPOSITIONS.ZERO_SOURCE_DATA,
      zeroReason: studentAudioSourceReason(studentSourceFailure.failureClass),
      zeroOrigin: ZERO_ORIGINS.SOURCE_DATA,
      metadata: {
        assetRole: 'STUDENT_AUDIO',
        sourceFileIdPresent: studentAudioAssets.some(asset => Boolean(asset.source_file_id)),
        failureClass: studentSourceFailure.failureClass || null,
        attemptCount: Number(studentSourceFailure.attemptCount || 0),
        retryExhausted: Boolean(studentSourceFailure.retryExhausted),
      },
    });
  } else if (speaking && (row.readiness_status === 'INVALID_AUDIO' || existingBusinessZero)) {
    const qualityError = errors.find(error => ['AUDIO_TOO_SHORT', 'AUDIO_NO_SIGNAL', 'INVALID_AUDIO'].includes(error.code));
    questionResolution = buildResolution({
      scoringDisposition: SCORING_DISPOSITIONS.ZERO_RESPONSE_QUALITY,
      zeroReason: qualityError?.code === 'INVALID_AUDIO' ? 'AUDIO_CORRUPTED' : (qualityError?.code || 'AUDIO_CORRUPTED'),
      zeroOrigin: ZERO_ORIGINS.RESPONSE_QUALITY,
      metadata: { assetRole: 'STUDENT_AUDIO' },
    });
  } else if (speaking && !(byRole.STUDENT_AUDIO || []).length) {
    questionResolution = buildResolution({
      scoringDisposition: SCORING_DISPOSITIONS.ZERO_CANDIDATE,
      zeroReason: 'ANSWER_NOT_PROVIDED',
      zeroOrigin: ZERO_ORIGINS.CANDIDATE,
      metadata: { sourceFileIdPresent: false },
    });
  }

  const handledCandidateErrors = new Set([
    ...BUSINESS_ZERO_INPUT_CODES,
    'IIG_MEDIA_HTTP_404', 'IIG_MEDIA_HTTP_401', 'IIG_MEDIA_HTTP_403',
    'IIG_MEDIA_PROCESSING_FAILED', 'IIG_MEDIA_SOURCE_MISSING',
  ]);
  const normalizedErrors = deduplicateErrors(errors);
  const fatalErrors = normalizedErrors.filter(error => {
    if (questionResolution.scoringDisposition === SCORING_DISPOSITIONS.NORMAL) return true;
    if (error.role === 'STUDENT_AUDIO') return false;
    return !handledCandidateErrors.has(error.code);
  });
  if (fatalErrors.length) {
    const invalidResolution = buildResolution({
      scoringDisposition: SCORING_DISPOSITIONS.INVALID_PROMPT_SOURCE,
      zeroOrigin: ZERO_ORIGINS.SOURCE_DATA,
      metadata: { validationErrors: fatalErrors },
    });
    return {
      attemptId: row.attempt_id,
      scorerType: row.scorer_type,
      questionNumber: Number(row.question_number),
      status: 'INVALID_INPUT',
      errors: normalizedErrors,
      aiInput: null,
      resolution: invalidResolution,
    };
  }

  return {
    attemptId: row.attempt_id,
    scorerType: row.scorer_type,
    questionNumber: Number(row.question_number),
    status: 'READY_FOR_AI',
    errors: normalizedErrors,
    aiInput: buildAiInput(row, {
      speaking,
      byRole,
      questionResolution,
    }),
    resolution: questionResolution,
  };
}

module.exports = {
  SPEAKING_TYPES,
  WRITING_TYPES,
  BUSINESS_ZERO_INPUT_CODES,
  WRITING_BUSINESS_ZERO_REASONS,
  mediaDescriptor,
  buildAiInput,
  validateAttempt,
};
