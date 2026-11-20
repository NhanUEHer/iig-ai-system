const test = require('node:test');
const assert = require('node:assert/strict');
const { sniffImage, normalizeImages, uploadImage } = require('../src/modules/content-studio/images/imageService');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const SHA = 'a'.repeat(64);
const KEY = `r2:content-studio/images/2026-11/${SHA}.png`;
const segments = [
  { kind: 'passage', questions: [] },
  { kind: 'question_set', questions: [{ number: 1 }, { number: 2 }] },
];

test('sniffImage trusts bytes, not names', () => {
  assert.equal(sniffImage(PNG).mime, 'image/png');
  assert.equal(sniffImage(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(16)])).mime, 'image/jpeg');
  assert.equal(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')).mime, 'image/webp');
  assert.equal(sniffImage(Buffer.from('%PDF-1.7 not an image')), null);
});

test('uploadImage rejects non-images and oversize files', async () => {
  await assert.rejects(uploadImage({ buffer: Buffer.from('hello world, not an image') }), { code: 'INVALID_IMAGE' });
  await assert.rejects(uploadImage({ buffer: Buffer.alloc(5 * 1024 * 1024 + 1) }), { code: 'IMAGE_TOO_LARGE' });
  await assert.rejects(uploadImage(undefined), { code: 'NO_FILE' });
});

test('normalizeImages resolves targets and rejects foreign keys', () => {
  assert.deepEqual(normalizeImages(undefined, segments), []);
  const [photo, graphic, loose] = normalizeImages([
    { storedKey: KEY, sha256: SHA, size: 100, segmentIndex: 1, questionNumber: 2 },
    { storedKey: KEY, sha256: SHA, size: 100, segmentIndex: 1 },
    { storedKey: KEY, sha256: SHA, size: 100, questionNumber: 1 },
  ], segments);
  assert.deepEqual([photo.segmentIndex, photo.questionNumber, photo.mime], [1, 2, 'image/png']);
  assert.deepEqual([graphic.segmentIndex, graphic.questionNumber], [1, null]);
  assert.deepEqual([loose.segmentIndex, loose.questionNumber, loose.position], [null, null, 2]);
  assert.throws(() => normalizeImages([{ storedKey: 'r2:secure-lectures/x.png', sha256: SHA }], segments), { code: 'INVALID_IMAGE' });
  assert.throws(() => normalizeImages([{ storedKey: KEY, sha256: SHA, segmentIndex: 0 }], segments), { code: 'INVALID_IMAGE_TARGET' });
  assert.throws(() => normalizeImages([{ storedKey: KEY, sha256: SHA, segmentIndex: 1, questionNumber: 9 }], segments), { code: 'INVALID_IMAGE_TARGET' });
});
