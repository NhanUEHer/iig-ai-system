const assert = require('node:assert/strict');
const test = require('node:test');

const { validateMappingInput, normalizeKeycode } = require('../src/modules/mappings/mappingValidator');

test('manual mapping validation normalizes valid keycodes and UUIDs', () => {
  const result = validateMappingInput({
    keycode: ' 0p5k8jdl ',
    courseScoringId: '01a10cbe-5139-7096-a3fa-705a31b65d0f',
    studentName: ' Nguyễn A ',
    testName: ' Đề 02 ',
  });
  assert.deepEqual(result.value, {
    keycode: '0P5K8JDL',
    courseScoringId: '01a10cbe-5139-7096-a3fa-705a31b65d0f',
    studentName: 'Nguyễn A',
    testName: 'Đề 02',
  });
});

test('manual mapping validation rejects malformed values', () => {
  assert.match(validateMappingInput({ keycode: 'bad!', courseScoringId: 'not-a-uuid' }).error, /Keycode/);
  assert.match(validateMappingInput({ keycode: 'ABC123', courseScoringId: 'not-a-uuid' }).error, /UUID/);
  assert.equal(normalizeKeycode('../ABC'), null);
});
