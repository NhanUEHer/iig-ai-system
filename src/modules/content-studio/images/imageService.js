'use strict';
const crypto = require('crypto');
const HttpError = require('../../../http/httpError');
const storage = require('../../../services/storageService');

// Images pasted or uploaded on the create page: Part 1 photos and Part 3/4 graphics.
// The file goes to R2 at upload time; createItem links it to a question or question set.

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 20;
const KEY_PREFIX = 'content-studio/images/';
const STORED_KEY = /^(?:r2|local):content-studio\/images\/\d{4}-\d{2}\/[0-9a-f]{64}\.(?:png|jpg|webp)$/;

// Trust the bytes, not the browser's mimetype.
function sniffImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

async function signedUrl(storedKey) {
  try { return await storage.getSignedAudioUrl(storedKey); } catch { return null; }
}

async function uploadImage(file, { now = new Date() } = {}) {
  if (!file?.buffer?.length) throw new HttpError('Chưa chọn ảnh.', 400, 'NO_FILE');
  if (file.buffer.length > MAX_BYTES) throw new HttpError('Ảnh tối đa 5 MB.', 400, 'IMAGE_TOO_LARGE');
  const type = sniffImage(file.buffer);
  if (!type) throw new HttpError('Chỉ hỗ trợ ảnh PNG, JPG hoặc WEBP.', 400, 'INVALID_IMAGE');
  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const key = `${KEY_PREFIX}${now.toISOString().slice(0, 7)}/${sha256}.${type.ext}`;
  const storedKey = await storage.uploadBuffer(file.buffer, key, type.mime);
  return { storedKey, sha256, mime: type.mime, size: file.buffer.length, url: await signedUrl(storedKey) };
}

// Validate what the client sends with createItem and resolve each image's target
// against the final segments (by segment index + optional question number).
function normalizeImages(images, segments) {
  if (images == null) return [];
  if (!Array.isArray(images)) throw new HttpError('Danh sách ảnh không hợp lệ.', 400, 'INVALID_IMAGES');
  if (images.length > MAX_IMAGES) throw new HttpError(`Tối đa ${MAX_IMAGES} ảnh cho một học liệu.`, 400, 'TOO_MANY_IMAGES');
  return images.map((image, position) => {
    const storedKey = String(image?.storedKey || '');
    const sha256 = String(image?.sha256 || '').toLowerCase();
    if (!STORED_KEY.test(storedKey) || !storedKey.includes(sha256) || !/^[0-9a-f]{64}$/.test(sha256)) {
      throw new HttpError(`Ảnh ${position + 1} không hợp lệ, hãy tải lại.`, 400, 'INVALID_IMAGE');
    }
    const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[storedKey.split('.').pop()];
    const size = Number(image?.size);
    let segmentIndex = image?.segmentIndex == null || image.segmentIndex === '' ? null : Number(image.segmentIndex);
    let questionNumber = image?.questionNumber == null || image.questionNumber === '' ? null : Number(image.questionNumber);
    if (segmentIndex !== null) {
      const segment = segments[segmentIndex];
      if (!Number.isInteger(segmentIndex) || segment?.kind !== 'question_set') throw new HttpError(`Ảnh ${position + 1}: nhóm câu hỏi không tồn tại.`, 400, 'INVALID_IMAGE_TARGET');
      if (questionNumber !== null && !segment.questions.some(question => question.number === questionNumber)) {
        throw new HttpError(`Ảnh ${position + 1}: câu ${questionNumber} không thuộc nhóm đã chọn.`, 400, 'INVALID_IMAGE_TARGET');
      }
    } else questionNumber = null;
    return { storedKey, sha256, mime, size: Number.isFinite(size) && size > 0 ? Math.min(Math.floor(size), MAX_BYTES) : 0, segmentIndex, questionNumber, position };
  });
}

async function insertImages(client, itemId, images, userId) {
  if (!images.length) return;
  const { rows: segments } = await client.query('SELECT id, position FROM cs_segments WHERE item_id = $1', [itemId]);
  const { rows: questions } = await client.query(
    'SELECT q.id, q.segment_id, q.number FROM cs_questions q JOIN cs_segments s ON s.id = q.segment_id WHERE s.item_id = $1', [itemId]);
  for (const image of images) {
    const segment = image.segmentIndex === null ? null : segments.find(row => row.position === image.segmentIndex);
    const question = segment && image.questionNumber !== null ? questions.find(row => row.segment_id === segment.id && row.number === image.questionNumber) : null;
    await client.query(`
      INSERT INTO cs_item_images (item_id, segment_id, question_id, position, storage_key, mime, size_bytes, sha256, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [itemId, segment?.id || null, question?.id || null, image.position, image.storedKey, image.mime, image.size, image.sha256, userId || null]);
  }
}

async function listImages(client, itemId) {
  const { rows } = await client.query(`
    SELECT id, segment_id AS "segmentId", question_id AS "questionId", position, storage_key AS "storedKey", mime, size_bytes AS size, sha256
    FROM cs_item_images WHERE item_id = $1 ORDER BY position`, [itemId]);
  return Promise.all(rows.map(async row => ({ ...row, url: await signedUrl(row.storedKey) })));
}

module.exports = { uploadImage, normalizeImages, insertImages, listImages, sniffImage, MAX_BYTES, MAX_IMAGES };
