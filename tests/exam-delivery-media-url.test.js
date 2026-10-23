const assert = require('node:assert/strict');
const test = require('node:test');

const storage = require('../src/services/storageService');
const deliveryCache = require('../src/modules/public-exam-events/examDeliveryCache');

test('delivery cache schema bypasses legacy generations containing expired URLs', () => {
  assert.equal(deliveryCache.cacheKey('version-1'), 'exam:delivery:v4:version-1');
  assert.equal(deliveryCache.currentKey('exam-1'), 'exam:published:v4:exam-1:current');
});

test('published delivery cache stores durable media references instead of expiring signed URLs', async () => {
  const bundle = await deliveryCache.buildDeliveryBundle({
    exam: { id: 'exam-1', title: 'Listening' },
    sections: [{ id: 'section-1', title: 'Listening', examMode: 'NON_STOP', sortOrder: 0 }],
    parts: [{
      id: 'part-1', sectionId: 'section-1', title: 'Part 1', examMode: 'NON_STOP', questions: [],
    }],
  }, [{
    id: 'media-1', part_id: 'part-1', media_type: 'AUDIO', storage_key: 'r2:exam-parts/instruction.mp3',
    mime_type: 'audio/mpeg', original_name: 'instruction.mp3', duration_seconds: 10,
  }]);

  const serialized = JSON.stringify(bundle);
  assert.match(serialized, /r2:exam-parts\/instruction\.mp3/);
  assert.doesNotMatch(serialized, /X-Amz-/);
  assert.equal(bundle.structure.sections[0].parts[0].instructionAudio.url, 'r2:exam-parts/instruction.mp3');
});

test('media URLs are signed at response time without mutating the cached payload', async () => {
  const original = storage.getSignedUrl;
  const calls = [];
  storage.getSignedUrl = async reference => {
    calls.push(reference);
    return `https://signed.example/${calls.length}?X-Amz-Date=now`;
  };
  const cached = {
    instructionAudio: { url: 'r2:part.mp3' },
    content: {
      audioUrl: 'r2:content.mp3',
      media: [{ type: 'AUDIO', url: 'r2:content.mp3' }],
    },
    questionAudioUrl: 'local:question.wav',
    cardImageStorageKey: 'r2:card.png',
  };

  try {
    const first = await deliveryCache.hydrateMediaUrls(cached);
    const second = await deliveryCache.hydrateMediaUrls(cached);

    assert.equal(cached.instructionAudio.url, 'r2:part.mp3');
    assert.equal(cached.content.audioUrl, 'r2:content.mp3');
    assert.match(first.instructionAudio.url, /^https:\/\/signed\.example\//);
    assert.equal(first.content.audioUrl, first.content.media[0].url);
    assert.match(first.questionAudioUrl, /^https:\/\/signed\.example\//);
    assert.equal(first.cardImageStorageKey, 'r2:card.png');
    assert.notEqual(first.instructionAudio.url, second.instructionAudio.url);
    assert.deepEqual(calls, [
      'r2:part.mp3', 'r2:content.mp3', 'local:question.wav',
      'r2:part.mp3', 'r2:content.mp3', 'local:question.wav',
    ]);
  } finally {
    storage.getSignedUrl = original;
  }
});
