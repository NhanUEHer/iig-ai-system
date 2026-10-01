const assert = require('node:assert/strict');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'public-attempt-question-test-secret-with-32-characters';

const repository = require('../src/modules/public-exam-events/publicExamEventRepository');
const media = require('../src/modules/exam-events/examEventMediaService');
const service = require('../src/modules/public-exam-events/publicExamEventService');
const answerStore = require('../src/modules/public-exam-events/attemptAnswerStore');
const deliveryCache = require('../src/modules/public-exam-events/examDeliveryCache');
const { signAttemptToken, verifyAttemptToken } = require('../src/modules/public-exam-events/publicCandidateToken');

const eventId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const candidateId = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-09-25T02:00:00Z');
const expiry = new Date('2026-09-25T02:30:00Z');
const tokenExpiry = new Date('2099-09-25T02:30:00Z');

const snapshot = {
  exam: { id: '44444444-4444-4444-8444-444444444444', title: 'English Quick Test', examType: 'LISTENING_READING' },
  sections: [{ id: 'section-1', title: 'Listening', examMode: 'NON_STOP', questionCount: 1, configuredDurationSeconds: 60, sortOrder: 0 }],
  parts: [{
    id: 'part-1', sectionId: 'section-1', examMode: 'NON_STOP', title: 'Listening', displayOrder: 0, questions: [{
      id: 'parent-1', note: 'internal', contents: [{
        id: '55555555-5555-4555-8555-555555555555', title: 'Questions 1-3',
        content_html: '<p>Public content</p>', script_html: '<p>Secret transcript</p>', translation_html: '<p>Secret translation</p>',
      }],
      subQuestions: [{
        id: '66666666-6666-4666-8666-666666666666',
        content_id: '55555555-5555-4555-8555-555555555555',
        prompt_html: '<p>What does the speaker mean?</p>', explanation: 'Secret explanation',
        options: [
          { id: 'a', option_key: 'A', option_text: 'Answer A', is_correct: true },
          { id: 'b', option_key: 'B', option_text: 'Answer B', is_correct: false },
        ],
      }],
    }],
  }],
};

function token(overrides = {}) {
  return signAttemptToken({ candidateId, eventId, attemptId, ...overrides }, tokenExpiry);
}

test('question delivery returns a safe flattened question list with signed audio', async () => {
  const originalState = repository.findAttemptQuestionState;
  const originalAttemptDelivery = repository.findAttemptQuestionDelivery;
  const originalUrl = media.getSignedMediaUrl;
  repository.findAttemptQuestionState = async () => ({ attempt: { id: attemptId, status: 'IN_PROGRESS', started_at: now, expires_at: expiry, exam_id: snapshot.exam.id, exam_version_id: 'version-1', exam_event_id: eventId, candidate_id: candidateId }, answers: [] });
  repository.findAttemptQuestionDelivery = async () => ({ snapshot,
    media: [{ id: 'media-1', content_id: snapshot.parts[0].questions[0].contents[0].id, sub_question_id: null, media_type: 'AUDIO', storage_key: 'local:audio.mp3', mime_type: 'audio/mpeg', original_name: 'audio.mp3' }],
  });
  media.getSignedMediaUrl = async key => `https://cdn.test/${key}`;
  try {
    const result = await service.getAttemptQuestions(eventId, attemptId, token(), { now });
    assert.equal(result.exam.totalQuestions, 1);
    assert.equal(result.parts[0].type, 'LISTENING');
    assert.equal(result.parts[0].questions[0].content.audioUrl, 'https://cdn.test/local:audio.mp3');
    assert.equal(result.parts[0].questions[0].group.label, 'Câu hỏi 1');
    assert.equal(result.parts[0].questions[0].group.from, 1);
    assert.equal(result.parts[0].questions[0].group.to, 1);
    assert.equal(result.parts[0].questions[0].options[0].key, 'A');
    const serialized = JSON.stringify(result);
    for (const secret of ['is_correct', 'script_html', 'translation_html', 'explanation', 'internal']) assert.equal(serialized.includes(secret), false);
  } finally {
    repository.findAttemptQuestionState = originalState;
    repository.findAttemptQuestionDelivery = originalAttemptDelivery;
    media.getSignedMediaUrl = originalUrl;
  }
});

test('delivery cache splits manifest, structure, Part index and safe question detail', async () => {
  const delivery = await deliveryCache.build(snapshot, []);
  const bundle = deliveryCache.buildBundle(delivery, snapshot);
  assert.equal(bundle.manifest.exam.examType, 'LISTENING_READING');
  assert.equal(bundle.structure.sections[0].parts[0].id, 'part-1');
  assert.equal(bundle.partQuestions['part-1'].questions[0].id, snapshot.parts[0].questions[0].subQuestions[0].id);
  const detail = bundle.questions[snapshot.parts[0].questions[0].subQuestions[0].id];
  assert.equal(detail.promptHtml, '<p>What does the speaker mean?</p>');
  assert.equal(JSON.stringify(detail).includes('is_correct'), false);
  assert.equal(bundle.grading.questions[detail.id].correctOptionKey, 'A');
});

test('delivery cache numbers question order independently inside each Part', async () => {
  const secondPartSnapshot = {
    ...snapshot,
    sections: [
      ...snapshot.sections,
      { id: 'section-2', title: 'Reading', examMode: 'FREESTYLE', questionCount: 1, configuredDurationSeconds: 60, sortOrder: 1 },
    ],
    parts: [
      ...snapshot.parts,
      {
        ...snapshot.parts[0],
        id: 'part-2',
        sectionId: 'section-2',
        examMode: 'FREESTYLE',
        displayOrder: 1,
        questions: [{
          ...snapshot.parts[0].questions[0],
          id: 'parent-2',
          subQuestions: [{ ...snapshot.parts[0].questions[0].subQuestions[0], id: '77777777-7777-4777-8777-777777777777' }],
        }],
      },
    ],
  };
  const delivery = await deliveryCache.build(secondPartSnapshot, []);
  const bundle = deliveryCache.buildBundle(delivery, secondPartSnapshot);
  assert.equal(bundle.partQuestions['part-1'].questions[0].sortOrder, 0);
  assert.equal(bundle.partQuestions['part-2'].questions[0].sortOrder, 0);
  assert.equal(bundle.questions['77777777-7777-4777-8777-777777777777'].sortOrder, 0);
});

test('question delivery rejects tokens scoped to another attempt', async () => {
  await assert.rejects(
    () => service.getAttemptQuestions(eventId, attemptId, token({ attemptId: '77777777-7777-4777-8777-777777777777' }), { now }),
    error => error.code === 'ATTEMPT_SCOPE_MISMATCH',
  );
});

test('question delivery rejects expired and completed attempts', async () => {
  const originalFind = repository.findAttemptQuestionState;
  try {
    repository.findAttemptQuestionState = async () => ({ attempt: { id: attemptId, status: 'SUBMITTED', expires_at: expiry, exam_version_id: 'version-1', exam_event_id: eventId, candidate_id: candidateId }, answers: [] });
    await assert.rejects(() => service.getAttemptQuestions(eventId, attemptId, token(), { now }), error => error.code === 'ATTEMPT_NOT_IN_PROGRESS');
    repository.findAttemptQuestionState = async () => ({ attempt: { id: attemptId, status: 'IN_PROGRESS', expires_at: new Date('2026-09-25T01:59:59Z'), exam_version_id: 'version-1', exam_event_id: eventId, candidate_id: candidateId }, answers: [] });
    await assert.rejects(() => service.getAttemptQuestions(eventId, attemptId, token(), { now }), error => error.code === 'ATTEMPT_EXPIRED');
  } finally { repository.findAttemptQuestionState = originalFind; }
});

test('answer autosave validates the option and persists one sub-question answer', async () => {
  const originalMeta = answerStore.readMeta;
  const originalSave = answerStore.save;
  const originalGrading = deliveryCache.getGradingOrBuild;
  let savedInput = null;
  answerStore.readMeta = async () => ({ id: attemptId, eventId, candidateId, versionId: 'version-1', status: 'IN_PROGRESS', expiresAt: expiry });
  answerStore.save = async (...input) => { savedInput = input; return true; };
  deliveryCache.getGradingOrBuild = async () => deliveryCache.buildGrading({ ...snapshot, exam: { ...snapshot.exam, pointsPerSubQuestion: 10 } });
  try {
    const subQuestionId = snapshot.parts[0].questions[0].subQuestions[0].id;
    const result = await service.saveAttemptAnswer(eventId, attemptId, subQuestionId, token(), { selectedOptionKey: 'B', flagged: true }, { now });
    assert.equal(savedInput[1], subQuestionId);
    assert.equal(savedInput[2].selectedOptionKey, 'B');
    assert.equal(result.flagged, true);
    await assert.rejects(
      () => service.saveAttemptAnswer(eventId, attemptId, subQuestionId, token(), { selectedOptionKey: 'Z' }, { now }),
      error => error.code === 'INVALID_SELECTED_OPTION',
    );
  } finally {
    answerStore.readMeta = originalMeta;
    answerStore.save = originalSave;
    deliveryCache.getGradingOrBuild = originalGrading;
  }
});

test('MCQ submission summary and submit score only answers from the immutable snapshot', async () => {
  const originalMeta = answerStore.readMeta;
  const originalRead = answerStore.readAll;
  const originalGrading = deliveryCache.getGradingOrBuild;
  const originalFinalize = repository.finalizeAttempt;
  const originalResultMeta = repository.getAttemptResultMeta;
  const originalMark = answerStore.markSubmitted;
  const answer = { sub_question_id: snapshot.parts[0].questions[0].subQuestions[0].id, selected_option: 'A', is_flagged: true };
  answerStore.readMeta = async () => ({ id: attemptId, eventId, candidateId, versionId: 'version-1', status: 'IN_PROGRESS', expiresAt: expiry });
  answerStore.readAll = async () => [{ subQuestionId: answer.sub_question_id, selectedOptionKey: answer.selected_option, flagged: true, savedAt: now }];
  answerStore.markSubmitted = async () => {};
  deliveryCache.getGradingOrBuild = async () => deliveryCache.buildGrading({ ...snapshot, exam: { ...snapshot.exam, pointsPerSubQuestion: 10 } });
  repository.finalizeAttempt = async ({ evaluation }) => ({ attempt: { id: attemptId, status: 'SUBMITTED', started_at: new Date(now.getTime()-60000), submitted_at: now, total_score: evaluation.totalScore }, evaluation });
  repository.getAttemptResultMeta = async () => ({ candidate: { full_name: 'Nguyễn Văn An', email: 'an@example.com', school_name: 'IIG Việt Nam' }, ranking: { rank: 2, total: 5 }, leaderboard: [{ attempt_id: 'other', full_name: 'Trần Minh Tuấn', total_score: 20, duration_seconds: 45 }, { attempt_id: attemptId, full_name: 'Nguyễn Văn An', total_score: 10, duration_seconds: 60 }] });
  try {
    const summary = await service.getSubmissionSummary(eventId, attemptId, token());
    assert.deepEqual({ total: summary.totalQuestions, answered: summary.answeredCount, flagged: summary.flaggedCount }, { total: 1, answered: 1, flagged: 1 });
    const result = await service.submitAttempt(eventId, attemptId, token(), { now });
    assert.equal(result.correctCount, 1);
    assert.equal(result.totalScore, 10);
    assert.equal(result.maxScore, 10);
    assert.equal(result.scorePercent, 100);
    assert.equal(result.status, 'SUBMITTED');
    assert.equal(result.durationSeconds, 60);
    assert.equal(result.leaderboard.entries[0].displayName, 'Trần Minh T.');
    assert.equal(result.leaderboard.entries[1].displayName, 'Bạn');
    assert.equal(verifyAttemptToken(result.resultToken).attemptId, attemptId);
  } finally {
    answerStore.readMeta = originalMeta;
    answerStore.readAll = originalRead;
    answerStore.markSubmitted = originalMark;
    deliveryCache.getGradingOrBuild = originalGrading;
    repository.finalizeAttempt = originalFinalize;
    repository.getAttemptResultMeta = originalResultMeta;
  }
});
