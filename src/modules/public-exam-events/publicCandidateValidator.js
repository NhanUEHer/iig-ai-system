const TOEIC_EXPERIENCES = [
  'NEVER_STUDIED',
  'STUDIED_NOT_TESTED',
  'TOOK_TOEIC',
  'OTHER_CERTIFICATE',
];

function optionalText(value, maxLength) {
  const text = String(value || '').trim();
  return text.slice(0, maxLength) || null;
}

function validateCandidateRegistration(input = {}) {
  const fullName = optionalText(input.fullName, 240) || 'Thí sinh';
  const phone = optionalText(input.phone, 50)?.replace(/[ .-]/g, '') || null;
  const email = optionalText(input.email, 240)?.toLowerCase() || null;
  const parsedBirthYear = Number(input.birthYear);
  const birthYear = Number.isInteger(parsedBirthYear) && parsedBirthYear >= 1900 && parsedBirthYear <= 2100
    ? parsedBirthYear
    : null;
  const toeicExperience = String(input.toeicExperience || '').trim();

  return {
    fullName,
    phone,
    email,
    schoolName: String(input.schoolName || '').trim().slice(0, 240) || null,
    birthYear,
    toeicExperience: TOEIC_EXPERIENCES.includes(toeicExperience) ? toeicExperience : null,
    marketingConsent: input.marketingConsent === true,
  };
}

module.exports = { TOEIC_EXPERIENCES, validateCandidateRegistration };
