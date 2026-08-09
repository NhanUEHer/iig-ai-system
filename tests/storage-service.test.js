const test = require('node:test');
const assert = require('node:assert/strict');

test('R2 audio keys mirror the production bucket layout', () => {
  const storage = require('../src/services/storageService');
  assert.equal(storage.objectKey('cleaned', 'answer.mp3'), 'cleaned-audio/answer.mp3');
  assert.equal(storage.objectKey('generated', 'dialogue.mp3'), 'dialogues/dialogue.mp3');
});
