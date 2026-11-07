const test = require('node:test');
const assert = require('node:assert/strict');

test('R2 audio keys mirror the production bucket layout', () => {
  const storage = require('../src/services/storageService');
  assert.equal(storage.objectKey('cleaned', 'answer.mp3'), 'cleaned-audio/answer.mp3');
  assert.equal(storage.objectKey('generated', 'dialogue.mp3'), 'dialogues/dialogue.mp3');
});

test('canonical ingestion bucket selects its isolated R2 credential profile', () => {
  const storage = require('../src/services/storageService');
  const env = {
    R2_ENDPOINT: 'https://default.example',
    R2_ACCESS_KEY: 'default-id',
    R2_SECRET_KEY: 'default-secret',
    R2_BUCKET: 'iig-admin-dev',
    IIG_SOURCE_R2_ENDPOINT: 'https://source.example',
    IIG_SOURCE_R2_ACCESS_KEY: 'source-id',
    IIG_SOURCE_R2_SECRET_KEY: 'source-secret',
    IIG_SOURCE_R2_BUCKET: 'iig-ai-dev',
  };

  assert.deepEqual(storage.resolveDownloadProfile('iig-ai-dev', env), {
    profile: 'iig-source',
    bucket: 'iig-ai-dev',
    endpoint: 'https://source.example',
    accessKey: 'source-id',
    secretKey: 'source-secret',
  });
  assert.equal(storage.resolveDownloadProfile('iig-admin-dev', env).profile, 'default');
});
