const assert = require('node:assert/strict');
const test = require('node:test');

const repository = require('../src/modules/public-exam-events/publicExamEventRepository');
const service = require('../src/modules/public-exam-events/publicExamEventService');
const { validateCandidateRegistration } = require('../src/modules/public-exam-events/publicCandidateValidator');

const eventId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-09-24T02:00:00Z');
const validInput = {
  fullName: 'Nguyễn Văn An', phone: '0912 345 678', email: 'AN@example.com',
  birthYear: 2002, toeicExperience: 'STUDIED_NOT_TESTED',
  privacyConsent: true, marketingConsent: false,
};

test('candidate registration normalizes and validates public profile fields', () => {
  const result = validateCandidateRegistration(validInput, now);
  assert.equal(result.phone, '0912345678');
  assert.equal(result.email, 'an@example.com');
  assert.equal(result.birthYear, 2002);
});

test('candidate registration requires privacy consent', () => {
  assert.throws(
    () => validateCandidateRegistration({ ...validInput, privacyConsent: false }, now),
    error => error.code === 'PRIVACY_CONSENT_REQUIRED',
  );
});

test('candidate registration returns the next step without starting an attempt', async () => {
  const original = repository.registerCandidate;
  repository.registerCandidate = async () => ({
    context: { status: 'PUBLISHED', exam_status: 'ACTIVE', start_at: '2026-09-24T01:00:00Z', end_at: '2026-09-24T03:00:00Z' },
    candidate: { id: 'candidate-1', full_name: 'Nguyễn Văn An', school_name: 'Đại học ABC' },
  });
  try {
    const result = await service.registerCandidate(eventId, validInput, { now });
    assert.equal(result.candidateId, 'candidate-1');
    assert.equal(result.fullName, 'Nguyễn Văn An');
    assert.equal(result.schoolName, 'Đại học ABC');
    assert.equal(result.nextStep, 'EXAM_INTRODUCTION');
    assert.equal(typeof result.candidateToken, 'string');
  } finally { repository.registerCandidate = original; }
});

test('candidate registration rejects an event outside its access window', async () => {
  const original = repository.registerCandidate;
  repository.registerCandidate = async () => ({
    context: { status: 'PUBLISHED', exam_status: 'ACTIVE', start_at: '2026-09-24T03:00:00Z', end_at: '2026-09-24T04:00:00Z' },
    candidate: null,
  });
  try {
    await assert.rejects(() => service.registerCandidate(eventId, validInput, { now }), error => error.code === 'PUBLIC_EXAM_UPCOMING');
  } finally { repository.registerCandidate = original; }
});
