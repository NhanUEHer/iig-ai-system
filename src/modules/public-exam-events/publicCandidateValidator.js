const HttpError = require('../../http/httpError');

const TOEIC_EXPERIENCES = [
  'NEVER_STUDIED',
  'STUDIED_NOT_TESTED',
  'TOOK_TOEIC',
  'OTHER_CERTIFICATE',
];

function requiredText(value, label, maxLength) {
  const text = String(value || '').trim();
  if (!text) throw new HttpError(`${label} là bắt buộc.`, 400, 'INVALID_CANDIDATE_PROFILE');
  if (text.length > maxLength) throw new HttpError(`${label} không được vượt quá ${maxLength} ký tự.`, 400, 'INVALID_CANDIDATE_PROFILE');
  return text;
}

function validateCandidateRegistration(input = {}, now = new Date()) {
  const fullName = requiredText(input.fullName, 'Họ và tên', 240);
  const phone = requiredText(input.phone, 'Số điện thoại', 50).replace(/[ .-]/g, '');
  const email = requiredText(input.email, 'Email', 240).toLowerCase();
  const birthYear = Number(input.birthYear);
  const maximumBirthYear = now.getUTCFullYear() - 10;
  const toeicExperience = String(input.toeicExperience || '').trim();

  if (!/^(?:\+?84|0)\d{8,10}$/.test(phone)) {
    throw new HttpError('Số điện thoại không hợp lệ.', 400, 'INVALID_PHONE');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError('Email không hợp lệ.', 400, 'INVALID_EMAIL');
  }
  if (!Number.isInteger(birthYear) || birthYear < 1950 || birthYear > maximumBirthYear) {
    throw new HttpError('Năm sinh không hợp lệ.', 400, 'INVALID_BIRTH_YEAR');
  }
  if (!TOEIC_EXPERIENCES.includes(toeicExperience)) {
    throw new HttpError('Tình trạng học/thi TOEIC không hợp lệ.', 400, 'INVALID_TOEIC_EXPERIENCE');
  }
  if (input.privacyConsent !== true) {
    throw new HttpError('Bạn cần đồng ý chính sách xử lý thông tin để tiếp tục.', 400, 'PRIVACY_CONSENT_REQUIRED');
  }

  return {
    fullName,
    phone,
    email,
    birthYear,
    toeicExperience,
    marketingConsent: input.marketingConsent === true,
  };
}

module.exports = { TOEIC_EXPERIENCES, validateCandidateRegistration };
