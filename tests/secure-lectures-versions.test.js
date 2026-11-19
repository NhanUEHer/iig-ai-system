const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { SecureLectureError } = require('../src/modules/secure-lectures/errors');
const { inspectHtml } = require('../src/modules/secure-lectures/services/htmlInspector');
const {
  createVersionService,
} = require('../src/modules/secure-lectures/services/versionService');
const {
  createBlobStore,
  createMemoryBlobStore,
} = require('../src/modules/secure-lectures/stores/blobStore');

function file(name, contents, mimetype = 'text/html') {
  return { originalname: name, mimetype, buffer: Buffer.from(contents) };
}

function expectCode(code) {
  return error => error instanceof SecureLectureError && error.code === code;
}

function createFakeDatabase(lectureId) {
  const state = { currentVersionId: null, versions: [], logs: [] };
  let nextId = 1;

  const client = {
    async query(sql, params) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT id FROM sl_lectures')) {
        return params[0] === lectureId
          ? { rowCount: 1, rows: [{ id: lectureId }] }
          : { rowCount: 0, rows: [] };
      }
      if (normalized.startsWith('SELECT COALESCE(MAX(version_no)')) {
        const max = state.versions.reduce((value, version) => Math.max(value, version.version_no), 0);
        return { rowCount: 1, rows: [{ version_no: max + 1 }] };
      }
      if (normalized.startsWith('INSERT INTO sl_lecture_versions')) {
        const row = {
          id: `version-${nextId++}`,
          lecture_id: params[0],
          version_no: params[1],
          storage_key: params[2],
          original_filename: params[3],
          content_type: 'text/html',
          size_bytes: params[4],
          sha256: params[5],
          note: params[6],
          meta: JSON.parse(params[7]),
          uploaded_by: params[8],
          created_at: new Date('2026-01-01T00:00:00Z'),
          updated_at: new Date('2026-01-01T00:00:00Z'),
        };
        state.versions.push(row);
        return { rowCount: 1, rows: [row] };
      }
      if (normalized.startsWith('UPDATE sl_lectures')) {
        state.currentVersionId = params[0];
        return { rowCount: 1, rows: [] };
      }
      if (normalized.startsWith('INSERT INTO sl_access_logs')) {
        state.logs.push({ lectureId: params[0], userId: params[1], meta: JSON.parse(params[2]) });
        return { rowCount: 1, rows: [] };
      }
      if (normalized.startsWith('SELECT * FROM sl_lecture_versions WHERE id = $1 AND lecture_id = $2')) {
        const rows = state.versions.filter(row => row.id === params[0] && row.lecture_id === params[1]);
        return { rowCount: rows.length, rows };
      }
      throw new Error(`Unexpected transaction query: ${normalized}`);
    },
  };

  return {
    state,
    async transaction(work) {
      return work(client);
    },
    async query(sql, params) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.includes('WHERE lecture_id = $1')) {
        const rows = state.versions
          .filter(row => row.lecture_id === params[0])
          .sort((a, b) => b.version_no - a.version_no);
        return { rowCount: rows.length, rows };
      }
      if (normalized.includes('WHERE id = $1')) {
        const rows = state.versions.filter(row => row.id === params[0]);
        return { rowCount: rows.length, rows };
      }
      throw new Error(`Unexpected database query: ${normalized}`);
    },
  };
}

test('HTML inspector rejects wrong extension, excessive size, invalid UTF-8, and non-HTML files', () => {
  assert.throws(() => inspectHtml(file('lecture.txt', '<html></html>')), expectCode('FILE_INVALID'));
  assert.throws(
    () => inspectHtml(file('lecture.html', '<html></html>'), { maxUploadMb: 0.000001 }),
    expectCode('FILE_TOO_LARGE'),
  );
  assert.throws(
    () => inspectHtml({
      originalname: 'lecture.html',
      mimetype: 'text/html',
      buffer: Buffer.from([0xc3, 0x28]),
    }),
    expectCode('FILE_INVALID'),
  );
  assert.throws(() => inspectHtml(file('lecture.html', 'plain text')), expectCode('FILE_INVALID'));
  assert.throws(
    () => inspectHtml(file('lecture.html', '<html></html>', 'application/octet-stream')),
    expectCode('FILE_INVALID'),
  );
});

test('HTML inspector extracts external hosts, slide estimate, and embedded audio metadata', () => {
  const inspected = inspectHtml(file('lecture.htm', `<!doctype html>
    <html><head><link href="https://fonts.googleapis.com/css2?family=Inter"></head>
    <body><section class="slide"><audio src="data:audio/mp3;base64,AA=="></audio></section></body></html>`));
  assert.deepEqual(inspected.meta.externalHosts, ['fonts.googleapis.com']);
  assert.equal(inspected.meta.slideCountGuess, 1);
  assert.equal(inspected.meta.hasAudio, true);
});

test('two immutable uploads produce v1 and v2, preserve bytes and sha256, and honor makeCurrent=false', async () => {
  const lectureId = '1f889692-498f-4cbb-a12f-f7f23e864f09';
  const userId = 'd56c62cc-55ab-454b-ac4e-af0551122f55';
  const database = createFakeDatabase(lectureId);
  const blobStore = createMemoryBlobStore();
  const service = createVersionService({ database, blobStore });
  const firstBytes = Buffer.from('<html><body>First</body></html>');
  const secondBytes = Buffer.from('<html><body>Second</body></html>');

  const v1 = await service.createVersion(
    lectureId,
    { originalname: 'first.html', mimetype: 'text/html', buffer: firstBytes },
    { userId, makeCurrent: true },
  );
  const v2 = await service.createVersion(
    lectureId,
    { originalname: 'second.html', mimetype: 'text/html', buffer: secondBytes },
    { userId, makeCurrent: false, note: 'review later' },
  );

  assert.equal(v1.versionNo, 1);
  assert.equal(v2.versionNo, 2);
  assert.equal(v1.sha256, crypto.createHash('sha256').update(firstBytes).digest('hex'));
  assert.equal(v2.sha256, crypto.createHash('sha256').update(secondBytes).digest('hex'));
  assert.match(v1.storageKey, new RegExp(`^secure-lectures/${lectureId}/v1-${v1.sha256.slice(0, 8)}\\.html$`));
  assert.match(v2.storageKey, new RegExp(`^secure-lectures/${lectureId}/v2-${v2.sha256.slice(0, 8)}\\.html$`));
  assert.equal(database.state.currentVersionId, v1.id);
  assert.equal(database.state.logs.length, 2);
  assert.deepEqual((await service.read(v1.id)).buffer, firstBytes);
  assert.deepEqual((await service.read(v2.id)).buffer, secondBytes);
  assert.deepEqual((await service.list(lectureId)).map(version => version.versionNo), [2, 1]);
});

test('local blob storage stays under a private root and R2 mode never requests a signed URL', async t => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'secure-lectures-'));
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));

  const local = createBlobStore({ mode: 'local', localRoot: temporaryRoot });
  const key = 'secure-lectures/lecture-1/v1-deadbeef.html';
  const bytes = Buffer.from('<html><body>Private</body></html>');
  await local.put(key, bytes, 'text/html');
  assert.deepEqual(await fs.readFile(path.join(temporaryRoot, key)), bytes);
  assert.deepEqual(await local.get(key), bytes);
  await local.remove(key);
  await assert.rejects(fs.readFile(path.join(temporaryRoot, key)), { code: 'ENOENT' });

  const calls = [];
  const r2 = createBlobStore({
    mode: 'r2',
    storage: {
      async uploadBuffer(buffer, storageKey, contentType, options) {
        calls.push(['put', storageKey, contentType, buffer.length, options]);
      },
      async downloadBuffer(storageKey, options) {
        calls.push(['get', storageKey, options]);
        return { buffer: bytes, contentType: 'text/html' };
      },
      async deleteFile(storageKey, options) {
        calls.push(['remove', storageKey, options]);
      },
      async getSignedUrl() {
        assert.fail('secure lecture storage must not create signed URLs');
      },
    },
  });
  await r2.put('lecture-2/v1-cafebabe.html', bytes, 'text/html');
  // A new instance forces an R2 read instead of satisfying it from the write cache.
  const r2Reader = createBlobStore({ mode: 'r2', storage: r2.storage });
  assert.deepEqual(await r2Reader.get('lecture-2/v1-cafebabe.html'), bytes);
  await r2.remove('lecture-2/v1-cafebabe.html');
  assert.deepEqual(calls.map(call => call[0]), ['put', 'get', 'remove']);
  assert.equal(calls[0][1], 'secure-lectures/lecture-2/v1-cafebabe.html');
  assert.deepEqual(calls[0][4], { requireRemote: true });
  assert.deepEqual(calls[1][2], { requireRemote: true });
  assert.deepEqual(calls[2][2], { requireRemote: true });
});
