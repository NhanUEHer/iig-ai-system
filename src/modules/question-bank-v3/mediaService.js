const crypto = require('crypto');
const HttpError = require('../../http/httpError');
const db = require('../../config/db');
const storage = require('../../services/storageService');
const audioMetadata = require('./audioMetadata');

const allowed = { IMAGE: ['image/'], AUDIO: ['audio/'], VIDEO: ['video/'] };
const MEDIA_TYPE_BY_SLUG = { audio: 'AUDIO', image: 'IMAGE', video: 'VIDEO' };
const CONTENT_COLUMN = { AUDIO: 'audio_media_id', IMAGE: 'image_media_id', VIDEO: 'video_media_id' };

function hasMpegAudioFrame(buffer) {
  const bytes = Buffer.from(buffer || []);
  const limit = Math.min(bytes.length - 3, 4096);
  for (let i = 0; i < limit; i++) {
    const b1 = bytes[i + 1], b2 = bytes[i + 2];
    if (bytes[i] !== 0xff || (b1 & 0xe0) !== 0xe0) continue;
    const version = (b1 >> 3) & 0x03, layer = (b1 >> 1) & 0x03, bitrate = (b2 >> 4) & 0x0f, sampleRate = (b2 >> 2) & 0x03;
    if (version !== 1 && layer !== 0 && bitrate !== 0 && bitrate !== 15 && sampleRate !== 3) return true;
  }
  return false;
}

function hasSignature(buffer, type) {
  const bytes = Buffer.from(buffer || []), header = bytes.subarray(0, 16);
  if (type === 'AUDIO') {
    const isMp3 = header.subarray(0, 3).toString('ascii') === 'ID3' || hasMpegAudioFrame(bytes);
    const isWav = header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WAVE';
    return isMp3 || isWav;
  }
  if (type === 'VIDEO') return header.subarray(4, 8).toString('ascii') === 'ftyp';
  if (type === 'IMAGE') {
    const isPng = header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    return isPng || isJpeg;
  }
  return false;
}

function validate(file) {
  if (!file?.buffer) throw new HttpError('File media là bắt buộc.', 400, 'MEDIA_FILE_REQUIRED');
  const type = Object.keys(allowed).find(k => allowed[k].some(prefix => String(file.mimetype).startsWith(prefix)));
  if (!type) throw new HttpError('Chỉ hỗ trợ ảnh, audio hoặc video.', 400, 'MEDIA_TYPE_INVALID');
  if (file.size > 100 * 1024 * 1024) throw new HttpError('File vượt quá 100MB.', 400, 'MEDIA_TOO_LARGE');
  if (!hasSignature(file.buffer, type)) {
    const header = Buffer.from(file.buffer).subarray(0, 256).toString('utf8').trimStart().toLowerCase();
    if (header.startsWith('<!doctype html') || header.startsWith('<html')) throw new HttpError('Tệp đã chọn thực chất là một trang HTML được lưu với đuôi .mp3, không phải file âm thanh. Vui lòng tải lại file MP3/WAV gốc.', 400, 'MEDIA_FILE_IS_HTML');
    throw new HttpError('Nội dung tệp không đúng với định dạng media đã chọn. Vui lòng chọn file MP3/WAV, MP4/MOV hoặc JPG/PNG hợp lệ.', 400, 'MEDIA_FILE_CONTENT_INVALID');
  }
  return type;
}

function publicMedia(r, url = null) {
  return {
    id: r.id,
    questionId: r.question_id,
    contentId: r.content_id || null,
    subQuestionId: r.sub_question_id || null,
    mediaType: r.media_type,
    originalName: r.original_name,
    mimeType: r.mime_type,
    fileSize: Number(r.file_size || 0),
    durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
    url,
  };
}

async function mediaDuration(type, file) {
  return type === 'AUDIO' ? audioMetadata.durationSeconds(file.buffer, file.originalname) : null;
}

function mediaTypeFromSlug(slug) {
  const type = MEDIA_TYPE_BY_SLUG[String(slug || '').toLowerCase()];
  if (!type) throw new HttpError('Loại media không hợp lệ. Chỉ hỗ trợ audio, image hoặc video.', 400, 'MEDIA_TYPE_SLUG_INVALID');
  return type;
}

async function contentTarget(contentId, client = db, lock = false) {
  const r = await client.query(
    `SELECT c.id, c.question_id, c.audio_media_id, c.image_media_id, c.video_media_id, q.status question_status
     FROM question_bank_contents c JOIN question_bank_questions q ON q.id=c.question_id WHERE c.id=$1${lock ? ' FOR UPDATE OF c' : ''}`,
    [contentId],
  );
  if (!r.rows[0]) throw new HttpError('Không tìm thấy Content.', 404, 'CONTENT_NOT_FOUND');
  return r.rows[0];
}

async function subQuestionTarget(subQuestionId, client = db, lock = false) {
  const r = await client.query(
    `SELECT s.id, s.question_id, s.audio_media_id, q.status question_status
     FROM question_bank_sub_questions s JOIN question_bank_questions q ON q.id=s.question_id WHERE s.id=$1${lock ? ' FOR UPDATE OF s' : ''}`,
    [subQuestionId],
  );
  if (!r.rows[0]) throw new HttpError('Không tìm thấy câu hỏi con.', 404, 'SUB_QUESTION_NOT_FOUND');
  return r.rows[0];
}

function assertEditable(status) {
  if (status === 'ACTIVE') throw new HttpError('Hãy chuyển câu hỏi sang Dừng hoạt động trước khi thay đổi media.', 409, 'ACTIVE_QUESTION_LOCKED');
}

async function storeFile(file, questionId, scope, targetId, mediaId) {
  const safe = String(file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `question-bank/${questionId}/${scope}/${targetId}/${mediaId}-${safe}`;
  const isDevelopment = process.env.NODE_ENV !== 'production' && process.env.APP_ENV !== 'production';
  return storage.uploadBuffer(file.buffer, key, file.mimetype, { preferLocal: isDevelopment });
}

async function deleteMediaRow(client, mediaId) {
  if (!mediaId) return;
  const row = await client.query('DELETE FROM question_bank_media WHERE id=$1 RETURNING storage_key', [mediaId]);
  return row.rows[0]?.storage_key || null;
}

async function cleanupStorageKey(key) {
  if (key) await storage.deleteFile(key).catch(error => console.error('[QuestionBankMedia] Cleanup failed:', key, error.message));
}

async function uploadStagedMedia(questionId, slug, file, userId) {
  const type = mediaTypeFromSlug(slug);
  const detected = validate(file);
  if (detected !== type) throw new HttpError('Loại tệp không khớp với loại media đã chọn.', 400, 'MEDIA_TYPE_MISMATCH');
  const question = await db.query('SELECT id,status FROM question_bank_questions WHERE id=$1', [questionId]);
  if (!question.rows[0]) throw new HttpError('Không tìm thấy câu hỏi.', 404, 'QUESTION_NOT_FOUND');
  assertEditable(question.rows[0].status);
  const mediaId = crypto.randomUUID();
  const duration = await mediaDuration(type, file);
  const storedKey = await storeFile(file, questionId, 'staged', mediaId, mediaId);
  try {
    const inserted = await db.query(
      `INSERT INTO question_bank_media(id,question_id,media_type,original_name,storage_key,mime_type,file_size,duration_seconds,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [mediaId, questionId, type, file.originalname, storedKey, file.mimetype, file.size, duration, userId || null],
    );
    const signedUrl = await storage.getSignedUrl(storedKey).catch(() => null);
    return publicMedia(inserted.rows[0], signedUrl);
  } catch (error) {
    await storage.deleteFile(storedKey).catch(() => {});
    throw error;
  }
}

// Upload (or replace) a media file for a content. Only one file per media type
// is kept; uploading a new file of the same type replaces the previous link and
// cleans up its storage object. The content's direct media ID column is updated
// in the same transaction as the media row insert.
async function uploadContentMedia(contentId, slug, file, userId) {
  const type = mediaTypeFromSlug(slug);
  const detected = validate(file);
  if (detected !== type) throw new HttpError('Loại tệp không khớp với loại media đã chọn.', 400, 'MEDIA_TYPE_MISMATCH');
  const target = await contentTarget(contentId);
  assertEditable(target.question_status);
  const mediaId = crypto.randomUUID();
  const duration = await mediaDuration(type, file);
  const storedKey = await storeFile(file, target.question_id, 'content', contentId, mediaId);
  try {
    const committed = await db.transaction(async client => {
      const lockedTarget = await contentTarget(contentId, client, true);
      assertEditable(lockedTarget.question_status);
      const previousId = lockedTarget[CONTENT_COLUMN[type]];
      const inserted = await client.query(
        `INSERT INTO question_bank_media(id,question_id,content_id,media_type,original_name,storage_key,mime_type,file_size,duration_seconds,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [mediaId, lockedTarget.question_id, contentId, type, file.originalname, storedKey, file.mimetype, file.size, duration, userId || null],
      );
      await client.query(`UPDATE question_bank_contents SET ${CONTENT_COLUMN[type]}=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [contentId, mediaId]);
      const oldStorageKey = previousId && previousId !== mediaId ? await deleteMediaRow(client, previousId) : null;
      return { row: inserted.rows[0], oldStorageKey };
    });
    await cleanupStorageKey(committed.oldStorageKey);
    const url = await storage.getSignedUrl(storedKey).catch(() => null);
    return publicMedia(committed.row, url);
  } catch (error) {
    await storage.deleteFile(storedKey).catch(() => {});
    throw error;
  }
}

async function removeContentMedia(contentId, slug) {
  const type = mediaTypeFromSlug(slug);
  const oldStorageKey = await db.transaction(async client => {
    const target = await contentTarget(contentId, client, true);
    assertEditable(target.question_status);
    const mediaId = target[CONTENT_COLUMN[type]];
    if (!mediaId) throw new HttpError('Content chưa có media loại này.', 404, 'MEDIA_NOT_FOUND');
    await client.query(`UPDATE question_bank_contents SET ${CONTENT_COLUMN[type]}=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [contentId]);
    return deleteMediaRow(client, mediaId);
  });
  await cleanupStorageKey(oldStorageKey);
  return { contentId, mediaType: type };
}

// Upload (or replace) the single audio file of a sub-question.
async function uploadSubQuestionAudio(subQuestionId, file, userId) {
  const detected = validate(file);
  if (detected !== 'AUDIO') throw new HttpError('Chỉ hỗ trợ tệp âm thanh cho câu hỏi con.', 400, 'MEDIA_TYPE_MISMATCH');
  const target = await subQuestionTarget(subQuestionId);
  assertEditable(target.question_status);
  const mediaId = crypto.randomUUID();
  const duration = await mediaDuration('AUDIO', file);
  const storedKey = await storeFile(file, target.question_id, 'sub_question', subQuestionId, mediaId);
  try {
    const committed = await db.transaction(async client => {
      const lockedTarget = await subQuestionTarget(subQuestionId, client, true);
      assertEditable(lockedTarget.question_status);
      const inserted = await client.query(
        `INSERT INTO question_bank_media(id,question_id,sub_question_id,media_type,original_name,storage_key,mime_type,file_size,duration_seconds,created_by)
         VALUES($1,$2,$3,'AUDIO',$4,$5,$6,$7,$8,$9) RETURNING *`,
        [mediaId, lockedTarget.question_id, subQuestionId, file.originalname, storedKey, file.mimetype, file.size, duration, userId || null],
      );
      await client.query('UPDATE question_bank_sub_questions SET audio_media_id=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1', [subQuestionId, mediaId]);
      const oldStorageKey = lockedTarget.audio_media_id && lockedTarget.audio_media_id !== mediaId
        ? await deleteMediaRow(client, lockedTarget.audio_media_id) : null;
      return { row: inserted.rows[0], oldStorageKey };
    });
    await cleanupStorageKey(committed.oldStorageKey);
    const url = await storage.getSignedUrl(storedKey).catch(() => null);
    return publicMedia(committed.row, url);
  } catch (error) {
    await storage.deleteFile(storedKey).catch(() => {});
    throw error;
  }
}

async function removeSubQuestionAudio(subQuestionId) {
  const oldStorageKey = await db.transaction(async client => {
    const target = await subQuestionTarget(subQuestionId, client, true);
    assertEditable(target.question_status);
    if (!target.audio_media_id) throw new HttpError('Câu hỏi con chưa có audio.', 404, 'MEDIA_NOT_FOUND');
    await client.query('UPDATE question_bank_sub_questions SET audio_media_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1', [subQuestionId]);
    return deleteMediaRow(client, target.audio_media_id);
  });
  await cleanupStorageKey(oldStorageKey);
  return { subQuestionId };
}

async function url(id) {
  const r = await db.query('SELECT storage_key FROM question_bank_media WHERE id=$1', [id]);
  if (!r.rows[0]) throw new HttpError('Không tìm thấy media.', 404, 'MEDIA_NOT_FOUND');
  return storage.getSignedUrl(r.rows[0].storage_key);
}

module.exports = {
  uploadStagedMedia,
  uploadContentMedia,
  removeContentMedia,
  uploadSubQuestionAudio,
  removeSubQuestionAudio,
  url,
  validate,
  hasSignature,
  mediaTypeFromSlug,
  cleanupStorageKey,
};
