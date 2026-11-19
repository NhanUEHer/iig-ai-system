const assert = require('node:assert/strict');
const test = require('node:test');

const { createSecureLectureMaintenance } = require('../src/modules/secure-lectures/services/secureLectureMaintenance');
const { createLogService } = require('../src/modules/secure-lectures/services/logService');
const { mapLecture, SELECT_LECTURE } = require('../src/modules/secure-lectures/repositories/lectureRepository');

const OLD_VERSION = { id: 'v-old', lecture_id: 'l-old', storage_key: 'secure-lectures/l-old/v1.html' };

function memoryMaintenance() {
  const state = {
    sessions: [{ id: 1, stale: true, ended: false }, { id: 2, stale: false, ended: false }],
    logs: [{ id: 1, old: true }, { id: 2, old: false }],
    versions: [OLD_VERSION],
    archiveDays: [],
  };
  return {
    state,
    async closeStaleSessions(ttl) { assert.equal(ttl, 90); let count = 0; for (const row of state.sessions) { if (row.stale && !row.ended) { row.ended = true; count += 1; } } return count; },
    async deleteExpiredLogs(days) { assert.equal(days, 180); const before = state.logs.length; state.logs = state.logs.filter(row => !row.old); return before - state.logs.length; },
    async listArchivedVersions(days) { state.archiveDays.push(days); return [...state.versions]; },
    async deleteArchivedVersion(id) { const index = state.versions.findIndex(row => row.id === id); if (index < 0) return false; state.versions.splice(index, 1); return true; },
  };
}

test('maintenance closes stale sessions, removes old logs and deletes only >30-day archived candidates', async () => {
  const repository = memoryMaintenance(); const removed = [];
  const maintenance = createSecureLectureMaintenance({ repository, blobStore: { async remove(key) { removed.push(key); } }, lock: { async acquire() { return true; } }, logger: { log() {}, error() {} } });
  const first = await maintenance.run();
  const second = await maintenance.run();
  assert.deepEqual(first, { skipped: false, timedOutSessions: 1, deletedLogs: 1, deletedVersions: 1, blobErrors: 0 });
  assert.equal(second.timedOutSessions, 0); assert.equal(second.deletedLogs, 0); assert.equal(second.deletedVersions, 0);
  assert.deepEqual(removed, [OLD_VERSION.storage_key]);
  assert.deepEqual(repository.state.archiveDays, [30, 30]);
});

test('maintenance does no work when the Redis-style singleton lock is unavailable', async () => {
  const repository = memoryMaintenance();
  const maintenance = createSecureLectureMaintenance({ repository, blobStore: {}, lock: { async acquire() { return false; } } });
  assert.deepEqual(await maintenance.run(), { skipped: true, reason: 'lock_unavailable' });
  assert.equal(repository.state.sessions[0].ended, false);
});

test('log service validates filters and returns a stable bigint cursor', async () => {
  const calls = [];
  const service = createLogService({ repository: { async list(filters) { calls.push(filters); return [{ id: '11' }, { id: '10' }]; } } });
  const page = await service.list({ lectureId: '00000000-0000-4000-8000-000000000001', denied: 'true', from: '2026-11-01T00:00:00Z', limit: '1' });
  assert.equal(page.items.length, 1); assert.ok(page.nextCursor); assert.equal(calls[0].denied, true);
  const parsed = JSON.parse(Buffer.from(page.nextCursor, 'base64url').toString('utf8'));
  assert.deepEqual(parsed, { beforeId: '11' });
});

test('lecture metrics expose row flags and 7-day detail counters including DEVICE_LIMIT SQL', () => {
  const lecture = mapLecture({ id: 'l1', title: 'Bài 1', expiring_share_count: 2, attention: true, open_ok_7d: 4, denied_count: 3, takeover_count: 1 });
  assert.equal(lecture.expiringShareCount, 2); assert.equal(lecture.attention, true);
  assert.deepEqual(lecture.accessMetrics, { openOk7d: 4, deniedCount: 3, takeoverCount: 1 });
  assert.match(SELECT_LECTURE, /DEVICE_LIMIT/);
  assert.match(SELECT_LECTURE, /INTERVAL '7 days'/);
});
