const assert = require('node:assert/strict');
const test = require('node:test');

const { SecureLectureError } = require('../src/modules/secure-lectures/errors');
const {
  createFolderService,
} = require('../src/modules/secure-lectures/services/folderService');
const {
  createLectureService,
} = require('../src/modules/secure-lectures/services/lectureService');

const IDS = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000007',
  '00000000-0000-4000-8000-000000000008',
];

function expectCode(code) {
  return error => error instanceof SecureLectureError && error.code === code;
}

function createMemoryFolderRepository() {
  const folders = [];
  const lectures = [];
  let nextId = 0;

  const children = id => folders.filter(folder => folder.parentId === id);
  const descendants = id => [id, ...children(id).flatMap(folder => descendants(folder.id))];
  const depth = id => {
    const folder = folders.find(candidate => candidate.id === id);
    return folder ? 1 + (folder.parentId ? depth(folder.parentId) : 0) : 0;
  };
  const height = id => {
    const nested = children(id);
    return 1 + (nested.length ? Math.max(...nested.map(folder => height(folder.id))) : 0);
  };

  const repository = {
    state: { folders, lectures },
    async transaction(work) { return work({}); },
    async list() {
      return {
        folders: folders.map(folder => ({
          ...folder,
          lectureCount: lectures.filter(lecture => lecture.folderId === folder.id).length,
        })),
        unfiledCount: lectures.filter(lecture => lecture.folderId === null).length,
      };
    },
    async findForUpdate(_client, id) {
      return folders.find(folder => folder.id === id) || null;
    },
    async exists(_client, id) { return folders.some(folder => folder.id === id); },
    async ancestorDepth(_client, id) { return depth(id); },
    async subtreeHeight(_client, id) { return height(id); },
    async isDescendant(_client, candidateId, id) { return descendants(id).includes(candidateId); },
    async insert(_client, { name, parentId }) {
      if (folders.some(folder => folder.parentId === parentId && folder.name.toLowerCase() === name.toLowerCase())) {
        const error = new Error('duplicate');
        error.code = '23505';
        error.constraint = 'sl_folders_parent_name_unique';
        throw error;
      }
      const folder = { id: IDS[nextId++], parentId, name, sortOrder: 0 };
      folders.push(folder);
      return { ...folder, lectureCount: 0 };
    },
    async update(_client, id, values) {
      if (folders.some(folder => folder.id !== id && folder.parentId === values.parentId
        && folder.name.toLowerCase() === values.name.toLowerCase())) {
        const error = new Error('duplicate');
        error.code = '23505';
        error.constraint = 'sl_folders_parent_name_unique';
        throw error;
      }
      const folder = folders.find(candidate => candidate.id === id);
      Object.assign(folder, values);
      return { ...folder };
    },
    async remove(_client, id) {
      if (!folders.some(folder => folder.id === id)) return false;
      const removed = new Set(descendants(id));
      for (const lecture of lectures) {
        if (removed.has(lecture.folderId)) lecture.folderId = null;
      }
      for (let index = folders.length - 1; index >= 0; index -= 1) {
        if (removed.has(folders[index].id)) folders.splice(index, 1);
      }
      return true;
    },
  };
  return repository;
}

test('folder service creates a three-level tree and rejects moving a parent into descendants', async () => {
  const repository = createMemoryFolderRepository();
  const service = createFolderService({ repository });
  const root = await service.create({ name: 'Khoá A' });
  const unit = await service.create({ name: 'Unit 1', parentId: root.id });
  const lesson = await service.create({ name: 'Lesson 1', parentId: unit.id });

  assert.equal((await service.list()).folders.length, 3);
  await assert.rejects(
    service.update(root.id, { parentId: lesson.id }),
    expectCode('FOLDER_CYCLE'),
  );
});

test('deleting a parent moves lectures from its full subtree to unfiled', async () => {
  const repository = createMemoryFolderRepository();
  const service = createFolderService({ repository });
  const root = await service.create({ name: 'Khoá A' });
  const child = await service.create({ name: 'Unit 1', parentId: root.id });
  repository.state.lectures.push({ id: IDS[5], folderId: child.id });

  await service.remove(root.id);

  assert.equal(repository.state.folders.length, 0);
  assert.equal(repository.state.lectures[0].folderId, null);
  assert.equal((await service.list()).unfiledCount, 1);
});

test('folder names are unique per parent but may repeat at another level', async () => {
  const repository = createMemoryFolderRepository();
  const service = createFolderService({ repository });
  const firstRoot = await service.create({ name: 'Unit' });
  await assert.rejects(service.create({ name: ' unit ' }), expectCode('NAME_TAKEN'));
  const nested = await service.create({ name: 'Unit', parentId: firstRoot.id });
  assert.equal(nested.parentId, firstRoot.id);
});

test('folder depth is limited to five levels including moved subtrees', async () => {
  const repository = createMemoryFolderRepository();
  const service = createFolderService({ repository });
  const level1 = await service.create({ name: 'L1' });
  const level2 = await service.create({ name: 'L2', parentId: level1.id });
  const level3 = await service.create({ name: 'L3', parentId: level2.id });
  const level4 = await service.create({ name: 'L4', parentId: level3.id });
  const level5 = await service.create({ name: 'L5', parentId: level4.id });

  await assert.rejects(
    service.create({ name: 'L6', parentId: level5.id }),
    expectCode('FOLDER_TOO_DEEP'),
  );

  const branch = await service.create({ name: 'Branch' });
  const leaf = await service.create({ name: 'Leaf', parentId: branch.id });
  await assert.rejects(
    service.update(branch.id, { parentId: level4.id }),
    expectCode('FOLDER_TOO_DEEP'),
  );
  assert.equal(leaf.parentId, branch.id);
});

test('lecture list passes unfiled, text and recursive-folder filters with default recursion', async () => {
  const calls = [];
  const repository = {
    async list(filters) {
      calls.push(filters);
      return [{ id: IDS[3], title: 'Grammar basics' }];
    },
  };
  const service = createLectureService({ repository, versions: {} });

  const unfiled = await service.list({ folderId: 'unfiled', q: 'Grammar' });
  const folder = await service.list({ folderId: IDS[0], includeSubfolders: 'false' });

  assert.equal(unfiled.items[0].title, 'Grammar basics');
  assert.equal(calls[0].folderId, 'unfiled');
  assert.equal(calls[0].q, 'Grammar');
  assert.equal(calls[0].includeSubfolders, true);
  assert.equal(calls[1].folderId, IDS[0]);
  assert.equal(calls[1].includeSubfolders, false);
});

test('the POST /folders route returns a 403 error for a view-only user', () => {
  const router = require('../src/routes/secureLectureRoutes');
  const route = router.stack.find(layer => layer.route?.path === '/folders'
    && layer.route.methods.post).route;
  const permissionMiddleware = route.stack[0].handle;
  let deniedError;

  permissionMiddleware(
    { auth: { userId: IDS[5], permissions: ['secure_lectures.view'] } },
    {},
    error => { deniedError = error; },
  );

  assert.equal(deniedError.statusCode, 403);
  assert.equal(deniedError.code, 'PERMISSION_DENIED');
});
