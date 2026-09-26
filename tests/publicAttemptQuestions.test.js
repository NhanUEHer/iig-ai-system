const assert = require('node:assert/strict');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'public-attempt-question-test-secret-with-32-characters';

const repository = require('../src/modules/public-exam-events/publicExamEventRepository');
const media = require('../src/modules/exam-events/examEventMediaService');
const service = require('../src/modules/public-exam-events/publicExamEventService');
const { signAttemptToken, verifyAttemptToken } = require('../src/modules/public-exam-events/publicCandidateToken');

const eventId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const candidateId = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-09-25T02:00:00Z');
const expiry = new Date('2026-09-25T02:30:00Z');
const tokenExpiry = new Date('2099-09-25T02:30:00Z');

const snapshot = {
  exam: { id: '44444444-4444-4444-8444-444444444444', title: 'English Quick Test' },
  parts: [{
    id: 'part-1', title: 'Listening', displayOrder: 0, questions: [{
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
  const originalFind = repository.findAttemptQuestionDelivery;
  const originalUrl = media.getSignedMediaUrl;
  repository.findAttemptQuestionDelivery = async () => ({
    attempt: { id: attemptId, status: 'IN_PROGRESS', started_at: now, expires_at: expiry, exam_id: snapshot.exam.id, question_snapshot: snapshot },
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
    repository.findAttemptQuestionDelivery = originalFind;
    media.getSignedMediaUrl = originalUrl;
  }
});

test('question delivery rejects tokens scoped to another attempt', async () => {
  await assert.rejects(
    () => service.getAttemptQuestions(eventId, attemptId, token({ attemptId: '77777777-7777-4777-8777-777777777777' }), { now }),
    error => error.code === 'ATTEMPT_SCOPE_MISMATCH',
  );
});

test('question delivery rejects expired and completed attempts', async () => {
  const originalFind = repository.findAttemptQuestionDelivery;
  try {
    repository.findAttemptQuestionDelivery = async () => ({ attempt: { id: attemptId, status: 'SUBMITTED', expires_at: expiry, question_snapshot: snapshot }, media: [] });
    await assert.rejects(() => service.getAttemptQuestions(eventId, attemptId, token(), { now }), error => error.code === 'ATTEMPT_NOT_IN_PROGRESS');
    repository.findAttemptQuestionDelivery = async () => ({ attempt: { id: attemptId, status: 'IN_PROGRESS', expires_at: new Date('2026-09-25T01:59:59Z'), question_snapshot: snapshot }, media: [] });
    await assert.rejects(() => service.getAttemptQuestions(eventId, attemptId, token(), { now }), error => error.code === 'ATTEMPT_EXPIRED');
  } finally { repository.findAttemptQuestionDelivery = originalFind; }
});

test('answer autosave validates the option and persists one sub-question answer', async () => {
  const originalFind = repository.findAttemptQuestionDelivery;
  const originalSave = repository.saveAttemptAnswer;
  let savedInput = null;
  repository.findAttemptQuestionDelivery = async () => ({
    attempt: { id: attemptId, status: 'IN_PROGRESS', expires_at: expiry, question_snapshot: snapshot },
    media: [], answers: [],
  });
  repository.saveAttemptAnswer = async input => {
    savedInput = input;
    return { attempt: { id: attemptId }, answer: { sub_question_id: input.subQuestionId, selected_option: input.selectedOption, is_flagged: input.flagged, updated_at: now } };
  };
  try {
    const subQuestionId = snapshot.parts[0].questions[0].subQuestions[0].id;
    const result = await service.saveAttemptAnswer(eventId, attemptId, subQuestionId, token(), { selectedOptionKey: 'B', flagged: true }, { now });
    assert.equal(savedInput.parentQuestionId, 'parent-1');
    assert.equal(savedInput.selectedOption, 'B');
    assert.equal(result.flagged, true);
    await assert.rejects(
      () => service.saveAttemptAnswer(eventId, attemptId, subQuestionId, token(), { selectedOptionKey: 'Z' }, { now }),
      error => error.code === 'INVALID_SELECTED_OPTION',
    );
  } finally {
    repository.findAttemptQuestionDelivery = originalFind;
    repository.saveAttemptAnswer = originalSave;
  }
});

test('MCQ submission summary and submit score only answers from the immutable snapshot', async () => {
  const originalFind = repository.findAttemptQuestionDelivery;
  const originalFinalize = repository.finalizeAttempt;
  const answer = { sub_question_id: snapshot.parts[0].questions[0].subQuestions[0].id, selected_option: 'A', is_flagged: true };
  repository.findAttemptQuestionDelivery = async () => ({
    attempt: { id: attemptId, status: 'IN_PROGRESS', expires_at: expiry, question_snapshot: snapshot }, media: [], answers: [answer],
  });
  repository.finalizeAttempt = async ({ evaluate }) => {
    const scoringSnapshot = structuredClone(snapshot);
    scoringSnapshot.exam.pointsPerSubQuestion = 10;
    const evaluation = evaluate(scoringSnapshot, [answer]);
    return { attempt: { id: attemptId, status: 'SUBMITTED', started_at: new Date(now.getTime()-60000), submitted_at: now, total_score: evaluation.totalScore }, answers: [answer], evaluation, candidate: { full_name: 'Nguyễn Văn An', email: 'an@example.com', school_name: 'IIG Việt Nam' }, ranking: { rank: 2, total: 5 }, leaderboard: [{ attempt_id: 'other', full_name: 'Trần Minh Tuấn', total_score: 20, duration_seconds: 45 }, { attempt_id: attemptId, full_name: 'Nguyễn Văn An', total_score: 10, duration_seconds: 60 }] };
  };
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
    repository.findAttemptQuestionDelivery = originalFind;
    repository.finalizeAttempt = originalFinalize;
  }
});
