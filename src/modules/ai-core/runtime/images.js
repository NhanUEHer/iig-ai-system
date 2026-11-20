'use strict';
const crypto = require('crypto');
const { AiCoreError } = require('../errors');

// Images sent alongside the rendered prompt (e.g. a TOEIC Part 1 photo).
// Callers pass { mimeType, data } where data is a Buffer or base64 string; the runtime
// works with base64 + hash, and only the hash/size/type ever reaches the call log.

const MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function normalizeImages(images) {
  if (images == null) return [];
  if (!Array.isArray(images)) throw new AiCoreError('VARIABLES_INVALID', 'images must be an array.');
  if (images.length > MAX_IMAGES) throw new AiCoreError('VARIABLES_INVALID', `At most ${MAX_IMAGES} images per call.`);
  return images.map((image, index) => {
    const mimeType = String(image?.mimeType || image?.mime || '').toLowerCase();
    if (!MIME_TYPES.has(mimeType)) throw new AiCoreError('VARIABLES_INVALID', `Image ${index + 1}: unsupported type "${mimeType || '?'}".`);
    const buffer = Buffer.isBuffer(image?.data) ? image.data
      : typeof image?.data === 'string' && image.data ? Buffer.from(image.data, 'base64') : null;
    if (!buffer?.length) throw new AiCoreError('VARIABLES_INVALID', `Image ${index + 1}: data is empty.`);
    if (buffer.length > MAX_IMAGE_BYTES) throw new AiCoreError('INPUT_TOO_LARGE', `Image ${index + 1} is larger than 5 MB.`);
    return Object.freeze({
      mimeType,
      data: buffer.toString('base64'),
      bytes: buffer.length,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    });
  });
}

// What the call log keeps: enough to identify the image, never its content.
const describeImages = images => images.map(({ mimeType, bytes, sha256 }) => ({ mimeType, bytes, sha256 }));

module.exports = { normalizeImages, describeImages, MAX_IMAGES, MAX_IMAGE_BYTES, MIME_TYPES };
