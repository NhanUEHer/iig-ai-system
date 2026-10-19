const crypto = require('crypto');
const path = require('path');
const db = require('../../config/db');
const HttpError = require('../../http/httpError');
const storage = require('../../services/storageService');
const repo = require('./examRepository');

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

function assertImage(file) {
  if (!file?.buffer) throw new HttpError('Vui lòng chọn ảnh đề thi.', 400, 'EXAM_IMAGE_REQUIRED');
  if (!allowedTypes.has(String(file.mimetype || '').toLowerCase())) throw new HttpError('Ảnh đề thi chỉ hỗ trợ JPG, PNG hoặc WebP.', 400, 'EXAM_IMAGE_TYPE_INVALID');
  if (Number(file.size || 0) > 5 * 1024 * 1024) throw new HttpError('Ảnh đề thi không được vượt quá 5MB.', 400, 'EXAM_IMAGE_TOO_LARGE');
  const header = Buffer.from(file.buffer).subarray(0, 16);
  const isPng = header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const isWebp = header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!isPng && !isJpeg && !isWebp) throw new HttpError('Nội dung file không phải ảnh JPG, PNG hoặc WebP hợp lệ.', 400, 'EXAM_IMAGE_CONTENT_INVALID');
}

async function upload(examId, file, userId) {
  assertImage(file);
  const current = await repo.findById(examId);
  if (!current) throw new HttpError('Không tìm thấy đề thi.', 404, 'EXAM_NOT_FOUND');
  if (current.status === 'ACTIVE') throw new HttpError('Hãy ngừng hoạt động đề thi trước khi thay đổi ảnh.', 409, 'ACTIVE_EXAM_LOCKED');
  const extension = path.extname(file.originalname || '').toLowerCase() || `.${file.mimetype.split('/')[1]}`;
  const key = `exam-cards/${examId}/${crypto.randomUUID()}${extension}`;
  const development = process.env.NODE_ENV !== 'production' && process.env.APP_ENV !== 'production';
  const storageKey = await storage.uploadBuffer(file.buffer, key, file.mimetype, { preferLocal: development });
  try {
    await db.transaction(async client => {
      const locked = await repo.lockExam(examId, client);
      if (!locked) throw new HttpError('Không tìm thấy đề thi.', 404, 'EXAM_NOT_FOUND');
      if (locked.status === 'ACTIVE') throw new HttpError('Hãy ngừng hoạt động đề thi trước khi thay đổi ảnh.', 409, 'ACTIVE_EXAM_LOCKED');
      await repo.setCardImage(examId, { storageKey, mimeType: file.mimetype, fileSize: file.size }, userId, client);
    });
    if (current.cardImage?.storageKey) await storage.deleteFile(current.cardImage.storageKey).catch(() => {});
    return { ...(await repo.findById(examId)).cardImage, url: await storage.getSignedUrl(storageKey).catch(() => null) };
  } catch (error) {
    await storage.deleteFile(storageKey).catch(() => {});
    throw error;
  }
}

async function remove(examId, userId) {
  const current = await repo.findById(examId);
  if (!current) throw new HttpError('Không tìm thấy đề thi.', 404, 'EXAM_NOT_FOUND');
  if (current.status === 'ACTIVE') throw new HttpError('Hãy ngừng hoạt động đề thi trước khi thay đổi ảnh.', 409, 'ACTIVE_EXAM_LOCKED');
  await repo.clearCardImage(examId, userId);
  if (current.cardImage?.storageKey) await storage.deleteFile(current.cardImage.storageKey).catch(() => {});
  return { removed: true };
}

module.exports = { upload, remove, assertImage };
