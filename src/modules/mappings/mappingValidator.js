const KEYCODE_PATTERN = /^[A-Z0-9]{6,20}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateMappingInput({ keycode, courseScoringId, studentName, testName }) {
  const normalizedKeycode = String(keycode || '').trim().toUpperCase();
  const normalizedCourseScoringId = String(courseScoringId || '').trim();
  if (!KEYCODE_PATTERN.test(normalizedKeycode)) {
    return { error: 'Keycode phải gồm 6-20 chữ cái in hoa hoặc chữ số.' };
  }
  if (!UUID_PATTERN.test(normalizedCourseScoringId)) {
    return { error: 'Course Scoring ID phải là UUID hợp lệ.' };
  }
  return {
    value: {
      keycode: normalizedKeycode,
      courseScoringId: normalizedCourseScoringId,
      studentName: studentName ? String(studentName).trim() : null,
      testName: testName ? String(testName).trim() : null,
    },
  };
}

function normalizeKeycode(keycode) {
  const normalized = String(keycode || '').trim().toUpperCase();
  return KEYCODE_PATTERN.test(normalized) ? normalized : null;
}

module.exports = { validateMappingInput, normalizeKeycode };
