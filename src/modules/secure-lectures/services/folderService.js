const { SecureLectureError } = require('../errors');
const { createFolderRepository } = require('../repositories/folderRepository');
const HttpError = require('../../../http/httpError');

const MAX_DEPTH = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value, field = 'id') {
  if (!UUID.test(String(value || ''))) {
    throw new HttpError(`${field} phải là UUID hợp lệ.`, 400, 'VALIDATION_ERROR');
  }
  return String(value);
}

function optionalParent(value) {
  if (value === undefined || value === null || value === '') return null;
  return requireUuid(value, 'parentId');
}

function requireName(value) {
  const name = String(value ?? '').trim();
  if (!name || name.length > 120) {
    throw new HttpError('Tên thư mục phải có từ 1 đến 120 ký tự.', 400, 'VALIDATION_ERROR');
  }
  return name;
}

function translateConflict(error) {
  if (error?.code === '23505' && error?.constraint === 'sl_folders_parent_name_unique') {
    throw new SecureLectureError('NAME_TAKEN', 'Tên thư mục đã tồn tại trong cùng cấp.');
  }
  throw error;
}

function createFolderService({ repository = createFolderRepository() } = {}) {
  const list = () => repository.list();

  async function create(input = {}, userId = null) {
    const name = requireName(input.name);
    const parentId = optionalParent(input.parentId);
    try {
      return await repository.transaction(async client => {
        if (parentId) {
          if (!await repository.exists(client, parentId)) {
            throw new HttpError('Thư mục cha không tồn tại.', 404, 'FOLDER_NOT_FOUND');
          }
          if (await repository.ancestorDepth(client, parentId) >= MAX_DEPTH) {
            throw new SecureLectureError('FOLDER_TOO_DEEP', `Cây thư mục tối đa ${MAX_DEPTH} cấp.`);
          }
        }
        return repository.insert(client, { name, parentId, userId });
      });
    } catch (error) {
      return translateConflict(error);
    }
  }

  async function update(id, input = {}, userId = null) {
    requireUuid(id);
    try {
      return await repository.transaction(async client => {
        const current = await repository.findForUpdate(client, id);
        if (!current) throw new HttpError('Thư mục không tồn tại.', 404, 'FOLDER_NOT_FOUND');

        const name = input.name === undefined ? current.name : requireName(input.name);
        const parentId = input.parentId === undefined ? current.parentId : optionalParent(input.parentId);
        const sortOrder = input.sortOrder === undefined ? current.sortOrder : Number(input.sortOrder);
        if (!Number.isInteger(sortOrder)) {
          throw new HttpError('sortOrder phải là số nguyên.', 400, 'VALIDATION_ERROR');
        }

        if (parentId) {
          if (!await repository.exists(client, parentId)) {
            throw new HttpError('Thư mục cha không tồn tại.', 404, 'FOLDER_NOT_FOUND');
          }
          if (await repository.isDescendant(client, parentId, id)) {
            throw new SecureLectureError('FOLDER_CYCLE', 'Không thể chuyển thư mục vào chính nó hoặc thư mục con.');
          }
          const parentDepth = await repository.ancestorDepth(client, parentId);
          const height = await repository.subtreeHeight(client, id);
          if (parentDepth + height > MAX_DEPTH) {
            throw new SecureLectureError('FOLDER_TOO_DEEP', `Cây thư mục tối đa ${MAX_DEPTH} cấp.`);
          }
        } else if (await repository.subtreeHeight(client, id) > MAX_DEPTH) {
          throw new SecureLectureError('FOLDER_TOO_DEEP', `Cây thư mục tối đa ${MAX_DEPTH} cấp.`);
        }

        return repository.update(client, id, { name, parentId, sortOrder, userId });
      });
    } catch (error) {
      return translateConflict(error);
    }
  }

  async function remove(id) {
    requireUuid(id);
    return repository.transaction(async client => {
      if (!await repository.remove(client, id)) {
        throw new HttpError('Thư mục không tồn tại.', 404, 'FOLDER_NOT_FOUND');
      }
      return { id };
    });
  }

  return { list, create, update, remove };
}

const service = createFolderService();
module.exports = { ...service, createFolderService, requireUuid, requireName, MAX_DEPTH };
