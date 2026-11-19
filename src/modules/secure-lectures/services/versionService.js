const crypto = require('node:crypto');

const db = require('../../../config/db');
const config = require('../config');
const { SecureLectureError } = require('../errors');
const { createBlobStore } = require('../stores/blobStore');
const { inspectHtml } = require('./htmlInspector');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function mapVersion(row) {
  if (!row) return null;
  return {
    id: row.id,
    lectureId: row.lecture_id,
    versionNo: row.version_no,
    storageKey: row.storage_key,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    note: row.note,
    meta: row.meta || {},
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createVersionService({
  database = db,
  blobStore = createBlobStore(),
  inspector = inspectHtml,
  storagePrefix = config.storagePrefix,
} = {}) {
  async function createVersion(lectureId, file, {
    note = null,
    makeCurrent = true,
    userId = null,
    transactionClient = null,
  } = {}) {
    const { meta } = inspector(file);
    const digest = sha256(file.buffer);
    let storedKey = null;

    try {
      const work = async client => {
        const lecture = await client.query(
          'SELECT id FROM sl_lectures WHERE id = $1 AND archived_at IS NULL FOR UPDATE',
          [lectureId],
        );
        if (lecture.rowCount === 0) {
          throw new SecureLectureError('LECTURE_NOT_READY', 'Bài giảng không tồn tại hoặc đã được lưu trữ.');
        }

        const numberResult = await client.query(
          'SELECT COALESCE(MAX(version_no), 0) + 1 AS version_no FROM sl_lecture_versions WHERE lecture_id = $1',
          [lectureId],
        );
        const versionNo = Number(numberResult.rows[0].version_no);
        storedKey = `${String(storagePrefix).replace(/^\/+|\/+$/g, '')}/${lectureId}/v${versionNo}-${digest.slice(0, 8)}.html`;
        await blobStore.put(storedKey, file.buffer, 'text/html; charset=utf-8');

        const inserted = await client.query(
          `INSERT INTO sl_lecture_versions
             (lecture_id, version_no, storage_key, original_filename, content_type,
              size_bytes, sha256, note, meta, uploaded_by)
           VALUES ($1, $2, $3, $4, 'text/html', $5, $6, $7, $8::jsonb, $9)
           RETURNING *`,
          [
            lectureId,
            versionNo,
            storedKey,
            file.originalname,
            file.buffer.length,
            digest,
            note || null,
            JSON.stringify(meta),
            userId,
          ],
        );
        const version = inserted.rows[0];

        if (makeCurrent) {
          await client.query(
            `UPDATE sl_lectures
             SET current_version_id = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [version.id, userId, lectureId],
          );
        }
        await client.query(
          `INSERT INTO sl_access_logs
             (lecture_id, actor_user_id, event, meta)
           VALUES ($1, $2, 'version_uploaded', $3::jsonb)`,
          [lectureId, userId, JSON.stringify({ versionId: version.id, versionNo })],
        );
        return mapVersion(version);
      };
      return transactionClient ? await work(transactionClient) : await database.transaction(work);
    } catch (error) {
      if (storedKey) await blobStore.remove(storedKey).catch(() => {});
      throw error;
    }
  }

  async function setCurrent(lectureId, versionId, userId = null) {
    return database.transaction(async client => {
      const lecture = await client.query(
        'SELECT id FROM sl_lectures WHERE id = $1 AND archived_at IS NULL FOR UPDATE',
        [lectureId],
      );
      if (lecture.rowCount === 0) {
        throw new SecureLectureError('LECTURE_NOT_READY', 'Bài giảng không tồn tại hoặc đã được lưu trữ.');
      }
      const version = await client.query(
        'SELECT * FROM sl_lecture_versions WHERE id = $1 AND lecture_id = $2',
        [versionId, lectureId],
      );
      if (version.rowCount === 0) {
        throw new SecureLectureError('LECTURE_NOT_READY', 'Phiên bản không thuộc bài giảng này.');
      }
      await client.query(
        `UPDATE sl_lectures
         SET current_version_id = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [versionId, userId, lectureId],
      );
      return mapVersion(version.rows[0]);
    });
  }

  async function list(lectureId) {
    const result = await database.query(
      `SELECT * FROM sl_lecture_versions
       WHERE lecture_id = $1
       ORDER BY version_no DESC`,
      [lectureId],
    );
    return result.rows.map(mapVersion);
  }

  async function read(versionId) {
    const result = await database.query(
      'SELECT * FROM sl_lecture_versions WHERE id = $1',
      [versionId],
    );
    if (result.rowCount === 0) {
      throw new SecureLectureError('LECTURE_NOT_READY', 'Không tìm thấy phiên bản bài giảng.');
    }
    const version = mapVersion(result.rows[0]);
    return { version, buffer: await blobStore.get(version.storageKey) };
  }

  async function removeBlob(storageKey) {
    if (storageKey) await blobStore.remove(storageKey);
  }

  return { createVersion, setCurrent, list, read, removeBlob };
}

const service = createVersionService();

module.exports = { ...service, createVersionService, mapVersion, sha256 };
