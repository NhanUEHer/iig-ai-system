const crypto = require('crypto');
const db = require('../../config/db');
const HttpError = require('../../http/httpError');
const storage = require('../../services/storageService');
const questionMedia = require('../question-bank-v3/mediaService');
const audioMetadata = require('../question-bank-v3/audioMetadata');

function assertMp3(file) {
  if (!file?.buffer) throw new HttpError('File audio hướng dẫn là bắt buộc.', 400, 'MEDIA_FILE_REQUIRED');
  if (file.size > 5 * 1024 * 1024) throw new HttpError('Audio hướng dẫn không được vượt quá 5MB.', 400, 'PART_AUDIO_INVALID');
  if (!/audio\/(mpeg|mp3)/i.test(String(file.mimetype || ''))) throw new HttpError('Audio hướng dẫn phải là định dạng MP3.', 400, 'PART_AUDIO_INVALID');
  if (questionMedia.validate(file) !== 'AUDIO') throw new HttpError('Audio hướng dẫn không hợp lệ.', 400, 'PART_AUDIO_INVALID');
}

async function lockEditableExam(examId, client) {
  const result = await client.query('SELECT status FROM exams WHERE id=$1 FOR UPDATE', [examId]);
  if (!result.rows[0]) throw new HttpError('Không tìm thấy đề thi.', 404, 'EXAM_NOT_FOUND');
  if (result.rows[0].status === 'ACTIVE') throw new HttpError('Hãy ngừng hoạt động đề thi trước khi thay đổi audio.', 409, 'ACTIVE_EXAM_LOCKED');
}

async function upload(examId, sectionId, partId, file, userId) {
  assertMp3(file);
  const part = await db.query('SELECT ep.id,e.status FROM exam_parts ep JOIN exams e ON e.id=ep.exam_id WHERE ep.id=$1 AND ep.exam_id=$2 AND ep.section_id=$3', [partId, examId, sectionId]);
  if (!part.rows[0]) throw new HttpError('Part không thuộc Phần thi này.', 404, 'PART_NOT_FOUND');
  if (part.rows[0].status === 'ACTIVE') throw new HttpError('Hãy ngừng hoạt động đề thi trước khi thay đổi audio.', 409, 'ACTIVE_EXAM_LOCKED');
  const mediaId = crypto.randomUUID();
  const safe = String(file.originalname || 'instruction.mp3').replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `exam-parts/${examId}/${partId}/${mediaId}-${safe}`;
  const duration = await audioMetadata.durationSeconds(file.buffer, file.originalname);
  const development = process.env.NODE_ENV !== 'production' && process.env.APP_ENV !== 'production';
  const storageKey = await storage.uploadBuffer(file.buffer, key, file.mimetype, { preferLocal: development });
  try {
    const result = await db.transaction(async client => {
      await lockEditableExam(examId, client);
      const locked = await client.query('SELECT instruction_audio_media_id FROM exam_parts WHERE id=$1 AND exam_id=$2 AND section_id=$3 FOR UPDATE', [partId, examId, sectionId]);
      if (!locked.rows[0]) throw new HttpError('Part không thuộc Phần thi này.', 404, 'PART_NOT_FOUND');
      const inserted = await client.query(
        `INSERT INTO question_bank_media(id,part_id,media_type,original_name,storage_key,mime_type,file_size,duration_seconds,created_by)
         VALUES($1,$2,'AUDIO',$3,$4,$5,$6,$7,$8) RETURNING *`,
        [mediaId, partId, file.originalname, storageKey, file.mimetype, file.size, duration, userId || null],
      );
      await client.query('UPDATE exam_parts SET instruction_audio_media_id=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1', [partId, mediaId]);
      let previousKey = null;
      if (locked.rows[0].instruction_audio_media_id) {
        const removed = await client.query('DELETE FROM question_bank_media WHERE id=$1 AND part_id=$2 RETURNING storage_key', [locked.rows[0].instruction_audio_media_id, partId]);
        previousKey = removed.rows[0]?.storage_key || null;
      }
      return { media: inserted.rows[0], previousKey };
    });
    if (result.previousKey) await storage.deleteFile(result.previousKey).catch(() => {});
    return { id: result.media.id, mediaType: 'AUDIO', originalName: result.media.original_name, fileSize: Number(result.media.file_size), durationSeconds: Number(result.media.duration_seconds), url: await storage.getSignedUrl(storageKey).catch(() => null) };
  } catch (error) {
    await storage.deleteFile(storageKey).catch(() => {});
    throw error;
  }
}

async function remove(examId, sectionId, partId) {
  const storageKey = await db.transaction(async client => {
    await lockEditableExam(examId, client);
    const locked = await client.query('SELECT instruction_audio_media_id FROM exam_parts WHERE id=$1 AND exam_id=$2 AND section_id=$3 FOR UPDATE', [partId, examId, sectionId]);
    if (!locked.rows[0]) throw new HttpError('Part không thuộc Phần thi này.', 404, 'PART_NOT_FOUND');
    const mediaId = locked.rows[0].instruction_audio_media_id;
    if (!mediaId) throw new HttpError('Part chưa có audio hướng dẫn.', 404, 'MEDIA_NOT_FOUND');
    await client.query('UPDATE exam_parts SET instruction_audio_media_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1', [partId]);
    const removed = await client.query('DELETE FROM question_bank_media WHERE id=$1 AND part_id=$2 RETURNING storage_key', [mediaId, partId]);
    return removed.rows[0]?.storage_key || null;
  });
  if (storageKey) await storage.deleteFile(storageKey).catch(() => {});
  return { partId, removed: true };
}

module.exports = { upload, remove, assertMp3 };
