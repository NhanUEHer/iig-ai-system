const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { validateAttempt } = require('../src/modules/iig-ingestion/inputValidator');
const worker = require('../src/modules/iig-ingestion/inputValidationWorker');

const event = {
  id: '8a11ff0e-fb67-4dda-a4bc-adf3582f49bf',
  jobId: 'b3ec3a90-e447-4f88-b2e2-99ead7f32468',
  publishAttempts: 1,
  lockedBy: 'worker-1',
};

function readyAsset(role, overrides = {}) {
  return {
    id: `${role.toLowerCase()}-asset`,
    asset_role: role,
    asset_index: 0,
    is_required: true,
    source_file_id: null,
    status: 'READY',
    canonical_storage_provider: 'R2',
    canonical_storage_bucket: 'private-media',
    canonical_storage_key: `iig/${role.toLowerCase()}`,
    canonical_mime_type: role.includes('AUDIO') ? 'audio/mpeg' : 'image/png',
    checksum_sha256: 'a'.repeat(64),
    duration_seconds: role.includes('AUDIO') ? '10.5' : null,
    quality_metrics: {},
    ...overrides,
  };
}

function attempt(overrides = {}) {
  return {
    attempt_id: 'attempt-1',
    submission_id: 'submission-1',
    exam_version_id: 'version-1',
    exam_question_id: 'question-1',
    source_question_id: 'source-question-1',
    question_number: 1,
    sort_order: 0,
    scorer_type: 'READ_TEXT_ALOUD',
    title: 'Question 1',
    question_text: null,
    prompt_text: 'Read the text aloud.',
    context_text: 'This is the official reading passage.',
    section_type: 'SPEAKING',
    source_mock_test_id: 'mock-test-1',
    answer_text: null,
    readiness_status: 'VALIDATING',
    validation_errors: [],
    assets: [readyAsset('STUDENT_AUDIO')],
    score_groups: [{ key: 'read-text', name: 'Read text aloud', minScore: 0, maxScore: 3 }],
    ...overrides,
  };
}

test('RTA validation creates an AI-safe input without candidate PII or signed URLs', () => {
  const result = validateAttempt(attempt());
  assert.equal(result.status, 'READY_FOR_AI');
  assert.equal(result.aiInput.response.type, 'audio');
  assert.equal(result.aiInput.response.audio.storage.key, 'iig/student_audio');
  assert.deepEqual(result.aiInput.transcriptionRequired, [
    { target: 'student_answer', assetId: 'student_audio-asset' },
  ]);
  const serialized = JSON.stringify(result.aiInput);
  assert.doesNotMatch(serialized, /candidate|email|signature=/i);
});

test('Q8-10 accepts prepared question audio and schedules question transcription', () => {
  const result = validateAttempt(attempt({
    scorer_type: 'RESPOND_USING_INFORMATION',
    question_number: 8,
    question_text: '',
    context_text: 'W: Hello. I am considering enrolling my daughter in one of your cooking classes.',
    assets: [
      readyAsset('STUDENT_AUDIO'),
      readyAsset('QUESTION_AUDIO'),
      readyAsset('CONTEXT_AUDIO', { is_required: false }),
      readyAsset('CONTEXT_IMAGE'),
    ],
    score_groups: [{ key: 'using-information', name: 'Respond using information', minScore: 0, maxScore: 3 }],
  }));
  assert.equal(result.status, 'READY_FOR_AI');
  assert.deepEqual(result.aiInput.transcriptionRequired, [
    { target: 'question', assetId: 'question_audio-asset' },
    { target: 'student_answer', assetId: 'student_audio-asset' },
  ]);
  assert.equal(result.aiInput.media.contextImages.length, 1);
});

test('missing context text schedules context STT only when prepared context audio exists', () => {
  const result = validateAttempt(attempt({
    scorer_type: 'RESPOND_USING_INFORMATION',
    question_number: 8,
    question_text: 'When does the workshop begin?',
    context_text: '',
    assets: [
      readyAsset('STUDENT_AUDIO'),
      readyAsset('CONTEXT_AUDIO', { is_required: false }),
      readyAsset('CONTEXT_IMAGE'),
    ],
    score_groups: [{ key: 'using-information', name: 'Respond using information', minScore: 0, maxScore: 3 }],
  }));
  assert.equal(result.status, 'READY_FOR_AI');
  assert.ok(result.aiInput.transcriptionRequired.some(task => task.target === 'context'));
});

test('review attempts stay terminal and do not create another transcription loop', () => {
  const result = validateAttempt(attempt({
    readiness_status: 'REVIEW',
    validation_errors: [{ code: 'IIG_CONTENT_STT_EMPTY', field: 'question.transcription', message: 'Review.' }],
  }));
  assert.equal(result.status, 'REVIEW');
  assert.equal(result.aiInput, null);
});

test('writing validation keeps an empty answer as a scoreable business-zero input', () => {
  const result = validateAttempt(attempt({
    scorer_type: 'WRITE_SENTENCE_PICTURE',
    section_type: 'WRITING',
    answer_text: '   ',
    assets: [readyAsset('QUESTION_IMAGE')],
    score_groups: [{ key: 'write-sentence', name: 'Write a sentence', minScore: 0, maxScore: 3 }],
  }));
  assert.equal(result.status, 'READY_FOR_AI');
  assert.equal(result.errors.length, 0);
  assert.equal(result.aiInput.businessZeroReason, 'BLANK_RESPONSE');
  assert.equal(result.aiInput.response.type, 'text');
  assert.equal(result.aiInput.response.text.trim(), '');
});

test('candidate audio quality failures become scoreable business-zero inputs', () => {
  const result = validateAttempt(attempt({
    readiness_status: 'INVALID_AUDIO',
    validation_errors: [{ code: 'AUDIO_NO_SIGNAL', field: 'media', message: 'No signal.' }],
  }));
  assert.equal(result.status, 'READY_FOR_AI');
  assert.equal(result.errors[0].code, 'AUDIO_NO_SIGNAL');
  assert.equal(result.aiInput.businessZeroReason, 'NO_SPEECH');
  assert.equal(result.resolution.scoringDisposition, 'ZERO_RESPONSE_QUALITY');
  assert.equal(result.resolution.zeroReason, 'AUDIO_NO_SIGNAL');
  assert.equal(result.resolution.zeroOrigin, 'RESPONSE_QUALITY');
  assert.equal(result.aiInput.response.audio, null);
  assert.deepEqual(result.aiInput.transcriptionRequired, []);
});

test('missing candidate answer audio becomes a candidate-origin zero', () => {
  const result = validateAttempt(attempt({ assets: [] }));

  assert.equal(result.status, 'READY_FOR_AI');
  assert.equal(result.aiInput.businessZeroReason, 'NO_SPEECH');
  assert.equal(result.resolution.scoringDisposition, 'ZERO_CANDIDATE');
  assert.equal(result.resolution.zeroReason, 'ANSWER_NOT_PROVIDED');
  assert.equal(result.resolution.zeroOrigin, 'CANDIDATE');
});

test('revalidation does not duplicate an existing missing-audio diagnostic', () => {
  const missingAudio = {
    code: 'STUDENT_AUDIO_MISSING',
    field: 'response.audio',
    message: 'Speaking response requires prepared candidate audio.',
  };
  const result = validateAttempt(attempt({
    readiness_status: 'PENDING_TRANSCRIPTION',
    validation_errors: [missingAudio],
    ai_input: {
      businessZeroReason: 'NO_SPEECH',
      scoringDisposition: 'ZERO_CANDIDATE',
      zeroReason: 'ANSWER_NOT_PROVIDED',
      zeroOrigin: 'CANDIDATE',
      resolutionMetadata: { sourceFileIdPresent: false },
    },
    assets: [],
  }));

  assert.equal(result.status, 'READY_FOR_AI');
  assert.deepEqual(result.errors, [missingAudio]);
});

test('exhausted student-audio source fetch becomes a source-data zero', () => {
  const result = validateAttempt(attempt({
    readiness_status: 'VALIDATING',
    validation_errors: [{
      assetId: 'student-audio-asset', role: 'STUDENT_AUDIO', code: 'IIG_MEDIA_HTTP_503',
      failureOrigin: 'SOURCE_DATA', failureClass: 'RETRY_EXHAUSTED',
      attemptCount: 5, retryExhausted: true,
    }],
    assets: [readyAsset('STUDENT_AUDIO', {
      status: 'FAILED', source_file_id: 'source-file-1', canonical_storage_key: null,
    })],
  }));

  assert.equal(result.status, 'READY_FOR_AI');
  assert.equal(result.aiInput.businessZeroReason, 'NO_SPEECH');
  assert.equal(result.resolution.scoringDisposition, 'ZERO_SOURCE_DATA');
  assert.equal(result.resolution.zeroReason, 'SOURCE_AUDIO_FETCH_EXHAUSTED');
  assert.equal(result.resolution.zeroOrigin, 'SOURCE_DATA');
  assert.equal(result.resolution.metadata.sourceFileIdPresent, true);
  assert.equal(result.resolution.metadata.attemptCount, 5);
});

test('failed required prompt media remains invalid instead of becoming a learner zero', () => {
  const result = validateAttempt(attempt({
    scorer_type: 'DESCRIBE_PICTURE',
    question_number: 3,
    readiness_status: 'INVALID_INPUT',
    validation_errors: [{
      assetId: 'question-image-asset', role: 'QUESTION_IMAGE', code: 'IIG_MEDIA_HTTP_404',
      failureOrigin: 'SOURCE_DATA', failureClass: 'PERMANENT_NOT_FOUND',
    }],
    assets: [readyAsset('STUDENT_AUDIO')],
  }));

  assert.equal(result.status, 'INVALID_INPUT');
  assert.equal(result.aiInput, null);
  assert.equal(result.scorerType, 'DESCRIBE_PICTURE');
  assert.equal(result.questionNumber, 3);
  assert.equal(result.resolution.scoringDisposition, 'INVALID_PROMPT_SOURCE');
});

test('business-zero survives revalidation while required question transcription is retained', () => {
  const result = validateAttempt(attempt({
    scorer_type: 'RESPOND_USING_INFORMATION',
    question_number: 8,
    readiness_status: 'PENDING_TRANSCRIPTION',
    question_text: 'According to the schedule, when does the workshop begin?',
    context_text: 'The workshop begins at 9 a.m.',
    validation_errors: [{ code: 'AUDIO_NO_SIGNAL', field: 'media', message: 'No signal.' }],
    ai_input: { businessZeroReason: 'NO_SPEECH' },
    assets: [
      readyAsset('STUDENT_AUDIO', { status: 'INVALID_AUDIO', canonical_storage_key: null }),
      readyAsset('QUESTION_AUDIO'),
      readyAsset('CONTEXT_IMAGE'),
    ],
    score_groups: [{ key: 'using-information', name: 'Respond using information', minScore: 0, maxScore: 3 }],
  }));

  assert.equal(result.status, 'READY_FOR_AI');
  assert.equal(result.aiInput.businessZeroReason, 'NO_SPEECH');
  assert.equal(result.aiInput.question.questionText, 'According to the schedule, when does the workshop begin?');
  assert.equal(result.aiInput.response.audio, null);
  assert.deepEqual(result.aiInput.transcriptionRequired, []);
});

test('required media must have a ready canonical storage object', () => {
  const result = validateAttempt(attempt({
    assets: [readyAsset('STUDENT_AUDIO', { status: 'PENDING_RETRY', canonical_storage_key: null })],
  }));
  assert.equal(result.status, 'INVALID_INPUT');
  assert.ok(result.errors.some(error => error.code === 'REQUIRED_MEDIA_NOT_READY'));
  assert.ok(result.errors.some(error => error.code === 'STUDENT_AUDIO_MISSING'));
});

test('every supported scorer type can produce its required AI input shape', () => {
  const cases = [
    ['READ_TEXT_ALOUD', { context_text: 'Passage.', assets: [readyAsset('STUDENT_AUDIO')] }],
    ['DESCRIBE_PICTURE', { assets: [readyAsset('STUDENT_AUDIO'), readyAsset('QUESTION_IMAGE')] }],
    ['RESPOND_TO_QUESTIONS', { question_text: 'Question?', assets: [readyAsset('STUDENT_AUDIO')] }],
    ['RESPOND_USING_INFORMATION', {
      question_text: 'Question?', context_text: 'Schedule.',
      assets: [readyAsset('STUDENT_AUDIO'), readyAsset('CONTEXT_IMAGE')],
    }],
    ['EXPRESS_AN_OPINION', { context_text: 'Opinion prompt.', assets: [readyAsset('STUDENT_AUDIO')] }],
    ['WRITE_SENTENCE_PICTURE', {
      section_type: 'WRITING', answer_text: 'A complete sentence.', assets: [readyAsset('QUESTION_IMAGE')],
    }],
    ['RESPOND_TO_WRITTEN_REQUEST', {
      section_type: 'WRITING', answer_text: 'Dear Sir, ...', context_text: 'Email request.', assets: [],
    }],
    ['WRITE_OPINION_ESSAY', {
      section_type: 'WRITING', answer_text: 'My opinion essay.', context_text: 'Essay prompt.', assets: [],
    }],
  ];
  for (const [scorerType, overrides] of cases) {
    const result = validateAttempt(attempt({
      scorer_type: scorerType,
      score_groups: [{ key: scorerType, name: scorerType, minScore: 0, maxScore: 5 }],
      ...overrides,
    }));
    assert.equal(result.status, 'READY_FOR_AI', scorerType);
    assert.equal(result.aiInput.question.scorerType, scorerType);
  }
});

test('Q6-Q7 accepts a ready context image when source text is absent', () => {
  const result = validateAttempt(attempt({
    scorer_type: 'RESPOND_TO_WRITTEN_REQUEST',
    question_number: 6,
    section_type: 'WRITING',
    question_text: 'Reply to the email and ask two questions.',
    context_text: '',
    answer_text: 'Dear Ms. Lee, thank you for your message. Could we meet on Monday?',
    assets: [readyAsset('CONTEXT_IMAGE')],
    score_groups: [{ key: 'written-request-q6', name: 'Written request Q6', minScore: 0, maxScore: 4 }],
  }));

  assert.equal(result.status, 'READY_FOR_AI');
  assert.equal(result.aiInput.media.contextImages.length, 1);
  assert.equal(result.aiInput.question.contextText, null);
});

test('Q6-Q7 accepts source text when no context image exists', () => {
  const result = validateAttempt(attempt({
    scorer_type: 'RESPOND_TO_WRITTEN_REQUEST',
    question_number: 7,
    section_type: 'WRITING',
    question_text: 'Reply to the complaint and propose two solutions.',
    context_text: 'A customer reports that a television arrived damaged.',
    answer_text: 'Dear Customer, we can replace the television or issue a refund.',
    assets: [],
    score_groups: [{ key: 'written-request-q7', name: 'Written request Q7', minScore: 0, maxScore: 4 }],
  }));

  assert.equal(result.status, 'READY_FOR_AI');
  assert.deepEqual(result.aiInput.media.contextImages, []);
});

test('Q6-Q7 rejects directions without source text or context image', () => {
  const result = validateAttempt(attempt({
    scorer_type: 'RESPOND_TO_WRITTEN_REQUEST',
    question_number: 6,
    section_type: 'WRITING',
    question_text: 'Reply to the email and ask two questions.',
    context_text: '',
    answer_text: 'Dear Ms. Lee, thank you for your message.',
    assets: [],
    score_groups: [{ key: 'written-request-q6', name: 'Written request Q6', minScore: 0, maxScore: 4 }],
  }));

  assert.equal(result.status, 'INVALID_INPUT');
  assert.ok(result.errors.some(error => error.code === 'WRITTEN_REQUEST_CONTEXT_MISSING'));
});

test('failed optional context media does not invalidate an otherwise complete question', () => {
  const result = validateAttempt(attempt({
    scorer_type: 'RESPOND_TO_QUESTIONS',
    question_text: 'What do you prefer?',
    context_text: 'Telephone interview context.',
    assets: [
      readyAsset('STUDENT_AUDIO'),
      readyAsset('CONTEXT_AUDIO', {
        is_required: false,
        status: 'FAILED',
        canonical_storage_key: null,
      }),
    ],
  }));
  assert.equal(result.status, 'READY_FOR_AI');
  assert.deepEqual(result.aiInput.media.contextAudio, []);
});

test('validation worker builds all attempt inputs and persists one summary', async () => {
  let persisted;
  const result = await worker.processEvent(event, {
    repository: {
      loadAttempts: async () => [attempt(), attempt({
        attempt_id: 'attempt-2',
        scorer_type: 'WRITE_OPINION_ESSAY',
        section_type: 'WRITING',
        answer_text: 'My essay.',
        assets: [],
        context_text: 'Essay prompt.',
        score_groups: [{ key: 'essay', name: 'Essay', minScore: 0, maxScore: 5 }],
      })],
      completeValidation: async input => {
        persisted = input.results;
        return {
          submissionId: '01a111ba-2883-78ce-98dd-335a6c85fc54',
          status: 'READY_FOR_AI', readyQuestions: 2, invalidQuestions: 0,
          scoringGroups: ['READ_TEXT_ALOUD'],
        };
      },
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.jobStatus, 'READY_FOR_AI');
  assert.equal(result.readyQuestions, 2);
  assert.equal(persisted.length, 2);
  assert.ok(persisted.every(item => item.status === 'READY_FOR_AI'));
  assert.deepEqual(result.scoringGroupsRequested, ['READ_TEXT_ALOUD']);
});

test('validation requests all four isolated Speaking scoring groups without creating runs inline', async () => {
  const result = await worker.processEvent(event, {
    repository: {
      loadAttempts: async () => [
        attempt(),
        attempt({
          attempt_id: 'attempt-3', question_number: 3, sort_order: 2,
          scorer_type: 'DESCRIBE_PICTURE', context_text: null,
          assets: [readyAsset('STUDENT_AUDIO'), readyAsset('QUESTION_IMAGE')],
          score_groups: [{ key: 'describe-picture', name: 'Describe Picture', minScore: 0, maxScore: 3 }],
        }),
        attempt({
          attempt_id: 'attempt-5', question_number: 5, sort_order: 3,
          scorer_type: 'RESPOND_TO_QUESTIONS', question_text: 'How often do you exercise?',
          assets: [readyAsset('STUDENT_AUDIO')],
          score_groups: [{ key: 'respond-q5-q10', name: 'Respond to questions', minScore: 0, maxScore: 3 }],
        }),
        attempt({
          attempt_id: 'attempt-11', question_number: 11, sort_order: 4,
          scorer_type: 'EXPRESS_AN_OPINION', context_text: 'Do you agree or disagree?',
          assets: [readyAsset('STUDENT_AUDIO')],
          score_groups: [{ key: 'express-opinion', name: 'Express an opinion', minScore: 0, maxScore: 5 }],
        }),
      ],
      completeValidation: async () => ({
        submissionId: '01a111ba-2883-78ce-98dd-335a6c85fc54',
        status: 'READY_FOR_AI', readyQuestions: 2, invalidQuestions: 0,
        scoringGroups: ['READ_TEXT_ALOUD', 'DESCRIBE_PICTURE', 'RESPOND_Q5_Q10', 'EXPRESS_OPINION'],
      }),
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
  });
  assert.deepEqual(result.scoringGroupsRequested, [
    'READ_TEXT_ALOUD', 'DESCRIBE_PICTURE', 'RESPOND_Q5_Q10', 'EXPRESS_OPINION',
  ]);
});

test('validation requests one isolated Writing Q1-Q5 run', async () => {
  const result = await worker.processEvent(event, {
    repository: {
      loadAttempts: async () => [attempt({
        scorer_type: 'WRITE_SENTENCE_PICTURE', section_type: 'WRITING',
        answer_text: '', assets: [readyAsset('QUESTION_IMAGE')],
        score_groups: [{ key: 'write-sentence', name: 'Write Sentence', minScore: 0, maxScore: 3 }],
      })],
      completeValidation: async () => ({
        submissionId: '01a111ba-2883-78ce-98dd-335a6c85fc54',
        status: 'READY_FOR_AI', readyQuestions: 1, invalidQuestions: 0,
        scoringGroups: ['WRITE_SENTENCE_Q1_Q5'],
      }),
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
  });
  assert.deepEqual(result.scoringGroupsRequested, ['WRITE_SENTENCE_Q1_Q5']);
});

test('validation repository maps Writing Q6-Q7 and Q8 to isolated scoring runs', () => {
  const root = path.resolve(__dirname, '..');
  const repository = fs.readFileSync(
    path.join(root, 'src/modules/iig-ingestion/inputValidationRepository.js'),
    'utf8'
  );
  assert.match(repository, /RESPOND_TO_WRITTEN_REQUEST.*WRITTEN_REQUEST_Q6_Q7/s);
  assert.match(repository, /WRITE_OPINION_ESSAY.*OPINION_ESSAY_Q8/s);
});

test('validation excludes an entire scoring group when one source question is invalid', () => {
  const { scoringGroup, eligibleScoringGroups } = require(
    '../src/modules/iig-ingestion/inputValidationRepository'
  );
  const invalid = validateAttempt(attempt({
    scorer_type: 'DESCRIBE_PICTURE',
    question_number: 3,
    readiness_status: 'INVALID_INPUT',
    validation_errors: [{
      role: 'QUESTION_IMAGE', code: 'IIG_MEDIA_HTTP_404',
      failureOrigin: 'SOURCE_DATA', failureClass: 'PERMANENT_NOT_FOUND',
    }],
    assets: [readyAsset('STUDENT_AUDIO')],
  }));
  assert.equal(scoringGroup(invalid), 'DESCRIBE_PICTURE');
  assert.equal(invalid.status, 'INVALID_INPUT');
  assert.deepEqual(eligibleScoringGroups([
    invalid,
    {
      scorerType: 'DESCRIBE_PICTURE', questionNumber: 4,
      status: 'READY_FOR_AI', aiInput: { question: {} },
    },
    {
      scorerType: 'READ_TEXT_ALOUD', questionNumber: 1,
      status: 'READY_FOR_AI', aiInput: { question: {} },
    },
  ]), ['READ_TEXT_ALOUD']);
  assert.deepEqual(eligibleScoringGroups([
    { scorerType: 'READ_TEXT_ALOUD', questionNumber: 1, status: 'READY_FOR_AI' },
  ], 1), []);
});

test('validation worker dead-letters a canonical submission with no attempts', async () => {
  let deadLetter;
  const result = await worker.processEvent(event, {
    repository: {
      loadAttempts: async () => [],
      completeValidation: async () => assert.fail('must not persist'),
      markRetry: async () => assert.fail('missing attempts are not transient'),
      markDeadLetter: async input => { deadLetter = input; },
    },
  });
  assert.equal(result.status, 'dead_letter');
  assert.equal(deadLetter.error.code, 'IIG_ATTEMPTS_MISSING');
});

test('validation repository stores AI inputs and completes the phase at READY_FOR_AI', () => {
  const root = path.resolve(__dirname, '..');
  const repository = fs.readFileSync(
    path.join(root, 'src/modules/iig-ingestion/inputValidationRepository.js'),
    'utf8'
  );
  const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
  assert.match(repository, /FOR UPDATE SKIP LOCKED/);
  assert.match(repository, /ai_input = \$4::jsonb/);
  assert.match(repository, /readiness_status = \$2::varchar/);
  assert.match(repository, /status = \$2::varchar/);
  assert.match(repository, /INPUT_VALIDATION_COMPLETED/);
  assert.match(repository, /INPUT_VALIDATION_RETRY_SCHEDULED/);
  assert.match(repository, /INPUT_VALIDATION_DEAD_LETTERED/);
  assert.match(repository, /QUESTION_TRANSCRIPTION_REQUESTED/);
  assert.match(repository, /PENDING_TRANSCRIPTION/);
  assert.match(repository, /eligibleScoringGroups\(results, pendingTranscriptions\)/);
  assert.match(repository, /input-validation:resolution-v2/);
  assert.match(repository, /iig_exam_question_transcriptions/);
  assert.match(repository, /'READY_FOR_AI'/);
  assert.match(repository, /IN \('READY_FOR_AI', 'INVALID_INPUT'\) THEN CURRENT_TIMESTAMP/);
  assert.match(server, /iig-ingestion\/inputValidationWorker/);
  assert.match(server, /iigInputValidationWorker\.startWorker/);
  assert.match(server, /iigInputValidationWorker\.stopWorker/);
});
