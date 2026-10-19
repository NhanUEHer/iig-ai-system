const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCandidateRegistration } = require('../src/modules/public-exam-events/publicCandidateValidator');

test('candidate profile metadata is optional and never blocks exam entry', () => {
  assert.deepEqual(validateCandidateRegistration({}), {
    fullName: 'Thí sinh',
    phone: null,
    email: null,
    schoolName: null,
    birthYear: null,
    toeicExperience: null,
    marketingConsent: false,
  });
});

test('invalid optional profile metadata is normalized instead of rejected', () => {
  const result = validateCandidateRegistration({
    fullName: '  Nguyễn Văn A  ',
    phone: 'not-a-phone',
    email: 'NOT-AN-EMAIL',
    birthYear: 'invalid',
    toeicExperience: 'UNKNOWN',
    schoolName: '  IIG Việt Nam  ',
  });

  assert.equal(result.fullName, 'Nguyễn Văn A');
  assert.equal(result.phone, 'notaphone');
  assert.equal(result.email, 'not-an-email');
  assert.equal(result.birthYear, null);
  assert.equal(result.toeicExperience, null);
  assert.equal(result.schoolName, 'IIG Việt Nam');
});
