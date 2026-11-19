const { SecureLectureError } = require('../errors');
const { createLectureRepository } = require('../repositories/lectureRepository');
const versionService = require('./versionService');
const { requireUuid } = require('./folderService');
const HttpError = require('../../../http/httpError');

const STATUSES = new Set(['shared', 'expiring', 'unshared', 'attention']);
const SORTS = new Set([
  'updated_desc', 'updated_asc', 'title_asc', 'title_desc', 'created_desc', 'created_asc',
]);

function requireTitle(value) {
  const title = String(value ?? '').trim();
  if (!title || title.length > 200) {
    throw new HttpError('Tiêu đề phải có từ 1 đến 200 ký tự.', 400, 'VALIDATION_ERROR');
  }
  return title;
}

function optionalFolderId(value) {
  if (value === undefined || value === null || value === '') return null;
  return requireUuid(value, 'folderId');
}

function encodeCursor(offset) {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (!Number.isInteger(parsed.offset) || parsed.offset < 0) throw new Error('invalid');
    return parsed.offset;
  } catch (_error) {
    throw new HttpError('cursor không hợp lệ.', 400, 'VALIDATION_ERROR');
  }
}

function createLectureService({
  repository = createLectureRepository(),
  versions = versionService,
} = {}) {
  async function assertFolder(client, folderId) {
    if (folderId && !await repository.folderExists(client, folderId)) {
      throw new HttpError('Thư mục không tồn tại.', 404, 'FOLDER_NOT_FOUND');
    }
  }

  async function create(input = {}, file, userId = null) {
    const title = requireTitle(input.title);
    const description = input.description == null ? null : String(input.description).trim() || null;
    const folderId = optionalFolderId(input.folderId);
    if (!file) throw new SecureLectureError('FILE_INVALID', 'Chưa chọn file HTML.');

    let createdVersion = null;
    try {
      return await repository.transaction(async client => {
        await assertFolder(client, folderId);
        const lectureId = await repository.insert(client, { title, description, folderId, userId });
        createdVersion = await versions.createVersion(lectureId, file, {
          note: input.note,
          makeCurrent: true,
          userId,
          transactionClient: client,
        });
        return repository.findById(lectureId, client);
      });
    } catch (error) {
      if (createdVersion?.storageKey && versions.removeBlob) {
        await versions.removeBlob(createdVersion.storageKey).catch(() => {});
      }
      throw error;
    }
  }

  async function list(query = {}) {
    const folderId = query.folderId && !['all', 'unfiled'].includes(query.folderId)
      ? requireUuid(query.folderId, 'folderId')
      : query.folderId || 'all';
    const includeSubfolders = query.includeSubfolders === undefined
      ? true
      : String(query.includeSubfolders).toLowerCase() !== 'false';
    const q = String(query.q || '').trim();
    if (q.length > 200) throw new HttpError('Từ khóa quá dài.', 400, 'VALIDATION_ERROR');
    const status = query.status || null;
    if (status && !STATUSES.has(status)) {
      throw new HttpError('status không hợp lệ.', 400, 'VALIDATION_ERROR');
    }
    const sort = query.sort || 'updated_desc';
    if (!SORTS.has(sort)) throw new HttpError('sort không hợp lệ.', 400, 'VALIDATION_ERROR');
    const limit = query.limit === undefined ? 50 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new HttpError('limit phải từ 1 đến 100.', 400, 'VALIDATION_ERROR');
    }
    const offset = decodeCursor(query.cursor);
    const rows = await repository.list({ folderId, includeSubfolders, q, status, sort, limit, offset });
    const hasMore = rows.length > limit;
    return {
      items: rows.slice(0, limit),
      nextCursor: hasMore ? encodeCursor(offset + limit) : null,
    };
  }

  async function detail(id) {
    requireUuid(id);
    const lecture = await repository.findById(id);
    if (!lecture) throw new HttpError('Bài giảng không tồn tại.', 404, 'LECTURE_NOT_FOUND');
    return {
      ...lecture,
      metrics: {
        currentVersion: lecture.currentVersion?.versionNo || null,
        activeShareCount: 0,
        revokedShareCount: 0,
        expiredShareCount: 0,
        registeredDeviceCount: 0,
        liveSessionCount: 0,
        openOk7d: 0,
        deniedCount: 0,
        takeoverCount: 0,
      },
    };
  }

  async function update(id, input = {}, userId = null) {
    requireUuid(id);
    const changes = {};
    if (input.title !== undefined) changes.title = requireTitle(input.title);
    if (input.description !== undefined) {
      changes.description = input.description == null ? null : String(input.description).trim() || null;
    }
    if (input.folderId !== undefined) changes.folder_id = optionalFolderId(input.folderId);
    if (!Object.keys(changes).length) return detail(id);
    await repository.transaction(async client => {
      if (Object.hasOwn(changes, 'folder_id')) await assertFolder(client, changes.folder_id);
      if (!await repository.update(id, changes, userId, client)) {
        throw new HttpError('Bài giảng không tồn tại.', 404, 'LECTURE_NOT_FOUND');
      }
    });
    return detail(id);
  }

  async function move(input = {}, userId = null) {
    if (!Array.isArray(input.lectureIds) || input.lectureIds.length < 1 || input.lectureIds.length > 100) {
      throw new HttpError('lectureIds phải chứa từ 1 đến 100 phần tử.', 400, 'VALIDATION_ERROR');
    }
    const lectureIds = [...new Set(input.lectureIds.map(id => requireUuid(id, 'lectureIds')))].sort();
    const folderId = optionalFolderId(input.folderId);
    const movedIds = await repository.transaction(async client => {
      await assertFolder(client, folderId);
      const ids = await repository.move(client, lectureIds, folderId, userId);
      if (!ids) {
        throw new HttpError('Một hoặc nhiều bài giảng không tồn tại.', 404, 'LECTURE_NOT_FOUND');
      }
      return ids;
    });
    return { lectureIds: movedIds, folderId };
  }

  async function archive(id, userId = null) {
    requireUuid(id);
    const archived = await repository.archive(id, userId);
    if (!archived) throw new HttpError('Bài giảng không tồn tại.', 404, 'LECTURE_NOT_FOUND');
    return { id: archived.id, archivedAt: archived.archived_at };
  }

  async function overview(query = {}) {
    const folderId = query.folderId && !['all', 'unfiled'].includes(query.folderId)
      ? requireUuid(query.folderId, 'folderId')
      : query.folderId || 'all';
    const includeSubfolders = query.includeSubfolders === undefined
      ? true
      : String(query.includeSubfolders).toLowerCase() !== 'false';
    return repository.overview({ folderId, includeSubfolders });
  }

  return { create, list, detail, update, move, archive, overview };
}

const service = createLectureService();
module.exports = {
  ...service,
  createLectureService,
  requireTitle,
  encodeCursor,
  decodeCursor,
};
