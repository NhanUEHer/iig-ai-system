const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'direct-attempt-device-lock-test-secret-32';

const repository = require('../src/modules/public-exams/publicExamAttemptRepository');
const service = require('../src/modules/public-exams/publicExamAttemptService');
const answerStore = require('../src/modules/public-exam-events/attemptAnswerStore');
const { signCandidateToken, signAttemptToken } = require('../src/modules/public-exam-events/publicCandidateToken');

const examId = '11111111-1111-4111-8111-111111111111';
const candidateId = '22222222-2222-4222-8222-222222222222';
const browserSessionId = '33333333-3333-4333-8333-333333333333';

test('direct attempt start requires a browser session identifier', async () => {
  await assert.rejects(
    () => service.start(examId, 'unused-token', { audioConfirmed: true }),
    error => error.statusCode === 400 && error.code === 'INVALID_IDENTIFIER',
  );
});

test('direct attempt start blocks an active attempt owned by another browser or device', async () => {
  const originalStart = repository.startAttempt;
  repository.startAttempt = async (_examId, _candidateId, input) => {
    assert.equal(input.clientSessionId, browserSessionId);
    return { conflict: true, attempt: { id: '44444444-4444-4444-8444-444444444444' } };
  };
  try {
    const candidateToken = signCandidateToken({ candidateId, examId }, new Date('2030-01-01T00:00:00Z'));
    await assert.rejects(
      () => service.start(examId, candidateToken, { audioConfirmed: true, clientSessionId: browserSessionId }),
      error => error.statusCode === 409 && error.code === 'ATTEMPT_ACTIVE_ON_ANOTHER_DEVICE',
    );
  } finally {
    repository.startAttempt = originalStart;
  }
});

test('device lock migration and repository serialize starts and persist browser ownership', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../src/database/migrations/119_attempt_client_session_lock.sql'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/public-exams/publicExamAttemptRepository.js'), 'utf8');
  assert.match(migration, /ADD COLUMN IF NOT EXISTS client_session_id UUID/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /existing\.client_session_id !== clientSessionId/);
  assert.match(source, /last_activity_at,client_session_id/);
});

test('resume merges durable fallback answers by newest saved time and hydrates Redis once', async () => {
  const originalFindAttempt = repository.findAttempt;
  const originalFindAnswers = repository.findAnswers;
  const originalReadAll = answerStore.readAll;
  const originalHydrate = answerStore.hydrate;
  let hydrated = null;
  repository.findAttempt = async () => ({
    id: '44444444-4444-4444-8444-444444444444', status: 'IN_PROGRESS',
    started_at: new Date('2026-10-06T01:00:00Z'), expires_at: new Date('2026-10-06T03:00:00Z'),
  });
  repository.findAnswers = async () => [{
    sub_question_id: '55555555-5555-4555-8555-555555555555', selected_option: 'B',
    is_flagged: false, answered_at: new Date('2026-10-06T01:05:00Z'),
  }];
  answerStore.readAll = async () => [{
    subQuestionId: '55555555-5555-4555-8555-555555555555', selectedOptionKey: 'A',
    flagged: false, savedAt: '2026-10-06T01:00:00Z',
  }];
  answerStore.hydrate = async (_attemptId, answers) => { hydrated = answers; return true; };
  try {
    const attemptId = '44444444-4444-4444-8444-444444444444';
    const attemptToken = require('../src/modules/public-exam-events/publicCandidateToken').signAttemptToken(
      { candidateId, examId, attemptId }, new Date('2030-01-01T00:00:00Z'),
    );
    const result = await service.resume(examId, attemptId, attemptToken, { now: new Date('2026-10-06T01:10:00Z') });
    assert.deepEqual(result.answeredQuestionIds, ['55555555-5555-4555-8555-555555555555']);
    assert.equal(hydrated[0].selectedOptionKey, 'B');
  } finally {
    repository.findAttempt = originalFindAttempt;
    repository.findAnswers = originalFindAnswers;
    answerStore.readAll = originalReadAll;
    answerStore.hydrate = originalHydrate;
  }
});

test('resume API is exposed as a dedicated one-time answer recovery endpoint', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/publicExamCatalogRoutes.js'), 'utf8');
  const frontend = fs.readFileSync(path.join(__dirname, '../exam-web/src/pages/ExamTestPage.jsx'), 'utf8');
  assert.match(routes, /attempts\/:attemptId\/resume/);
  assert.match(frontend, /resumeExamAttempt\(session\)/);
  assert.match(frontend, /Đang khôi phục đáp án đã lưu/);
});

test('repeated submit returns the stored result without grading or writing again', async () => {
  const originalFindAttempt = repository.findAttempt;
  const originalFindStoredResult = repository.findStoredResult;
  const attemptId = '44444444-4444-4444-8444-444444444444';
  const submittedAt = new Date('2026-10-06T01:10:00Z');
  repository.findAttempt = async () => ({ id: attemptId, status: 'SUBMITTED' });
  repository.findStoredResult = async () => ({
    attempt: { id: attemptId, submitted_at: submittedAt, total_score: 10, duration_seconds: 60 },
    evaluation: {
      totalQuestions: 2, answeredCount: 1, unansweredCount: 1, correctCount: 1, incorrectCount: 0,
      totalScore: 10, scoreRangeMin: 10, scoreRangeMax: 15, maxScore: 990,
      sectionResults: [], scoringVersion: 'LR_RAW_CORRECT_V1',
    },
  });
  try {
    const attemptToken = signAttemptToken({ candidateId, examId, attemptId }, new Date('2030-01-01T00:00:00Z'));
    const result = await service.submit(examId, attemptId, attemptToken);
    assert.equal(result.status, 'SUBMITTED');
    assert.equal(result.totalScore, 10);
    assert.equal(result.alreadySubmitted, true);
  } finally {
    repository.findAttempt = originalFindAttempt;
    repository.findStoredResult = originalFindStoredResult;
  }
});

test('submit waits for autosave, retries failures, and backend serializes finalization', () => {
  const frontend = fs.readFileSync(path.join(__dirname, '../exam-web/src/pages/ExamTestPage.jsx'), 'utf8');
  const backend = fs.readFileSync(path.join(__dirname, '../src/modules/public-exams/publicExamAttemptService.js'), 'utf8');
  const repositorySource = fs.readFileSync(path.join(__dirname, '../src/modules/public-exams/publicExamAttemptRepository.js'), 'utf8');
  assert.match(frontend, /Promise\.allSettled\(\[\.\.\.pendingSavesRef\.current\.values\(\)\]\)/);
  assert.match(frontend, /failedIds\.map\(async questionId/);
  assert.match(frontend, /Có \$\{failedSavesRef\.current\.size\} câu chưa đồng bộ/);
  assert.match(backend, /allowExpired: true/);
  assert.match(backend, /\['IN_PROGRESS', 'EXPIRED', 'SUBMITTED'\]/);
  assert.match(repositorySource, /FOR UPDATE/);
  assert.match(repositorySource, /result\.alreadySubmitted|alreadySubmitted: true/);
});
