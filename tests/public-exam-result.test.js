const assert = require('node:assert/strict');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'public-exam-result-test-secret-at-least-32-characters';

const repository = require('../src/modules/public-exams/publicExamAttemptRepository');
const service = require('../src/modules/public-exams/publicExamAttemptService');
const { signAttemptToken } = require('../src/modules/public-exam-events/publicCandidateToken');

const examId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';
const candidateId = '33333333-3333-4333-8333-333333333333';
const sectionId = '44444444-4444-4444-8444-444444444444';

test('direct public result API returns presentation-ready summary without loading answer rows', async () => {
  const originalStored = repository.findStoredResult;
  const originalPresentation = repository.findResultPresentation;
  repository.findStoredResult = async () => ({
    attempt: {
      exam_id: examId,
      status: 'SUBMITTED',
      started_at: new Date('2026-10-06T02:00:00Z'),
      submitted_at: new Date('2026-10-06T02:01:00Z'),
      duration_seconds: 60,
    },
    evaluation: {
      totalQuestions: 4,
      answeredCount: 3,
      unansweredCount: 1,
      correctCount: 2,
      incorrectCount: 1,
      totalScore: 250,
      maxScore: 495,
      scoreRangeMin: 250,
      scoreRangeMax: 255,
      scoringVersion: 'LR_RAW_CORRECT_V1',
      sectionResults: [{
        sectionId,
        sectionTitle: 'Listening',
        totalQuestions: 4,
        answeredCount: 3,
        unansweredCount: 1,
        correctCount: 2,
        incorrectCount: 1,
        exactScore: 250,
        scoreRangeMin: 250,
        scoreRangeMax: 255,
        maxPossibleScore: 495,
      }],
      partBreakdown: [{
        id: 'part-1', sectionId, title: 'Part 1', totalQuestions: 4,
        answeredCount: 3, unansweredCount: 1, correctCount: 2, incorrectCount: 1,
      }],
    },
  });
  repository.findResultPresentation = async () => ({
    meta: {
      exam_id: examId,
      exam_code: 'LR-04',
      exam_title: 'TOEIC Listening & Reading',
      exam_type: 'TOEIC_LR',
      allowed_duration_seconds: 7200,
      candidate_id: candidateId,
      candidate_number: 'TS-2026-0001',
      full_name: 'Nguyễn Văn An',
      email: 'an@example.com',
      phone: '0900000000',
      school_name: 'IIG Việt Nam',
      rank: 4,
      total_candidates: 10,
    },
    leaderboard: [{
      attempt_id: '55555555-5555-4555-8555-555555555555',
      full_name: 'Trần Minh Anh',
      total_score: 495,
      max_score: 495,
      duration_seconds: 45,
      correct_count: 4,
      answered_count: 4,
    }],
  });

  try {
    const token = signAttemptToken({ candidateId, examId, attemptId }, new Date('2030-01-01T00:00:00Z'));
    const result = await service.result(examId, attemptId, token);
    assert.equal(result.exam.title, 'TOEIC Listening & Reading');
    assert.equal(result.candidate.candidateNumber, 'TS-2026-0001');
    assert.equal(result.accuracyPercent, 50);
    assert.equal(result.averageSecondsPerAnswered, 20);
    assert.equal(result.sections[0].parts[0].title, 'Part 1');
    assert.equal(result.ranking.topPercent, 40);
    assert.equal(result.leaderboard.entries[0].displayName, 'Trần Minh A.');
    assert.equal(result.leaderboard.pointsToTop3, 245);
  } finally {
    repository.findStoredResult = originalStored;
    repository.findResultPresentation = originalPresentation;
  }
});
