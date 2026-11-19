const assert = require('node:assert/strict');
const test = require('node:test');

const HttpError = require('../src/http/httpError');
const { SecureLectureError } = require('../src/modules/secure-lectures/errors');
const tokenService = require('../src/modules/secure-lectures/services/tokenService');
const {
  computeStatus,
  createShareService,
} = require('../src/modules/secure-lectures/services/shareService');
const {
  createLectureRepository,
} = require('../src/modules/secure-lectures/repositories/lectureRepository');
const {
  createLectureService,
} = require('../src/modules/secure-lectures/services/lectureService');

const LECTURE_ID = '00000000-0000-4000-8000-000000000001';
const SHARE_ID = '00000000-0000-4000-8000-000000000002';
const VERSION_ID = '00000000-0000-4000-8000-000000000003';
const USER_ID = '00000000-0000-4000-8000-000000000004';
const DEVICE_ID = '00000000-0000-4000-8000-000000000005';
const NOW = new Date('2026-11-19T08:00:00.000Z');

function expectCode(code) {
  return error => (error instanceof HttpError || error instanceof SecureLectureError)
    && error.code === code;
}

function createMemoryShareRepository({ lectureReady = true } = {}) {
  const shares = [];
  const logs = [];
  const devices = [{
    id: DEVICE_ID,
    share_id: SHARE_ID,
    device_id: '00000000-0000-4000-8000-000000000006',
    label: 'Chrome · macOS',
    removed_at: null,
    blocked_at: null,
    live_sessions: [],
  }];
  let endedShare = 0;
  let endedDevice = 0;

  const repository = {
    state: { shares, logs, devices },
    get endedShare() { return endedShare; },
    get endedDevice() { return endedDevice; },
    async transaction(work) { return work({}); },
    async create(_client, input) {
      if (!lectureReady) return null;
      const row = {
        id: SHARE_ID,
        lecture_id: input.lectureId,
        pinned_version_id: input.pinnedVersionId,
        token_hash: input.tokenHash,
        token_hint: input.tokenHint,
        recipient_name: input.recipientName,
        recipient_email: input.recipientEmail,
        valid_from: input.validFrom,
        expires_at: input.expiresAt,
        max_devices: input.maxDevices,
        max_concurrent: input.maxConcurrent,
        watermark_enabled: input.watermarkEnabled,
        guard_enabled: input.guardEnabled,
        note: input.note,
        revoked_at: null,
        created_by: input.userId,
        updated_by: input.userId,
        created_at: NOW,
        updated_at: NOW,
        device_count: 0,
        live_session_count: 0,
      };
      shares.push(row);
      return row;
    },
    async list(lectureId) { return shares.filter(row => row.lecture_id === lectureId); },
    async findById(id) { return shares.find(row => row.id === id) || null; },
    async update(_client, id, changes, userId) {
      const row = shares.find(item => item.id === id);
      const columns = {
        recipientName: 'recipient_name', recipientEmail: 'recipient_email',
        pinnedVersionId: 'pinned_version_id', validFrom: 'valid_from',
        expiresAt: 'expires_at', maxDevices: 'max_devices',
        maxConcurrent: 'max_concurrent', watermarkEnabled: 'watermark_enabled',
        guardEnabled: 'guard_enabled', note: 'note',
      };
      for (const [field, value] of Object.entries(changes)) row[columns[field]] = value;
      row.updated_by = userId;
      return row;
    },
    async pinnedVersionBelongsToLecture(_client, _lectureId, versionId) {
      return versionId === null || versionId === VERSION_ID;
    },
    async revoke(_client, id, reason, userId) {
      const row = shares.find(item => item.id === id);
      row.revoked_at = NOW;
      row.revoked_by = userId;
      row.revoke_reason = reason;
      return row;
    },
    async endSessionsForShare() { endedShare += 1; },
    async listDevices() { return devices; },
    async mutateDevice(_client, shareId, deviceRef, action, userId) {
      const device = devices.find(item => item.id === deviceRef && item.share_id === shareId);
      if (!device) return null;
      if (action === 'remove') {
        device.removed_at = NOW;
        device.removed_by = userId;
      } else if (action === 'block') {
        device.blocked_at = NOW;
        device.blocked_by = userId;
      } else {
        device.blocked_at = null;
        device.blocked_by = null;
      }
      return device;
    },
    async endSessionsForDevice() { endedDevice += 1; },
    async log(_client, entry) { logs.push(entry); },
  };
  return repository;
}

function createService(options = {}) {
  const repository = options.repository || createMemoryShareRepository();
  const sessionCalls = [];
  const sessions = options.sessions || {
    async endAllForShare(...args) { sessionCalls.push(['share', ...args]); },
    async endAllForDevice(...args) { sessionCalls.push(['device', ...args]); },
  };
  return {
    repository,
    sessionCalls,
    service: createShareService({
      repository,
      sessions,
      now: () => new Date(NOW),
      publicBaseUrl: 'https://admin.example/',
    }),
  };
}

test('token service creates 32-byte base64url tokens and stable SHA-256 hashes', () => {
  const token = tokenService.generate();
  const digest = tokenService.hash(token);
  assert.equal(token.length, 43);
  assert.equal(tokenService.isWellFormed(token), true);
  assert.equal(tokenService.isWellFormed(`${token}x`), false);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(tokenService.hashesEqual(digest, tokenService.hash(token)), true);
});

test('create returns the token once while storage and list expose only its hash hint', async () => {
  const { service, repository } = createService();
  const created = await service.create(LECTURE_ID, {
    recipientName: 'Cô Lan',
    expiresAt: '2026-12-01T08:00:00.000Z',
  }, USER_ID);

  assert.equal(created.token.length, 43);
  assert.equal(created.url, `https://admin.example/v/${created.token}`);
  assert.equal(repository.state.shares[0].token_hash, tokenService.hash(created.token));
  assert.equal(repository.state.shares[0].token, undefined);
  assert.equal(repository.state.logs[0].event, 'share_created');

  const listed = await service.list(LECTURE_ID);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].token, undefined);
  assert.equal(listed[0].tokenHash, undefined);
  assert.equal(listed[0].token_hash, undefined);
  assert.equal(listed[0].tokenHint, created.token.slice(-4));
});

test('create validates expiry range, concurrency and lecture readiness', async () => {
  const { service } = createService();
  await assert.rejects(service.create(LECTURE_ID, {
    recipientName: 'Cô Lan', expiresAt: '2026-11-18T08:00:00.000Z',
  }), expectCode('VALIDATION_ERROR'));
  await assert.rejects(service.create(LECTURE_ID, {
    recipientName: 'Cô Lan', expiresAt: '2027-11-20T08:00:00.000Z',
  }), expectCode('VALIDATION_ERROR'));
  await assert.rejects(service.create(LECTURE_ID, {
    recipientName: 'Cô Lan', expiresAt: '2026-12-01T08:00:00.000Z',
    maxDevices: 2, maxConcurrent: 3,
  }), expectCode('VALIDATION_ERROR'));

  const repository = createMemoryShareRepository({ lectureReady: false });
  const notReady = createService({ repository }).service;
  await assert.rejects(notReady.create(LECTURE_ID, {
    recipientName: 'Cô Lan', expiresAt: '2026-12-01T08:00:00.000Z',
  }), expectCode('LECTURE_NOT_READY'));
});

test('computeStatus follows revoked, expired, scheduled, active order and expiring flag', () => {
  const base = { validFrom: '2026-11-18T08:00:00Z', expiresAt: '2026-11-25T08:00:00Z' };
  assert.deepEqual(computeStatus({ ...base, revokedAt: NOW }, NOW), {
    status: 'revoked', expiring: false,
  });
  assert.deepEqual(computeStatus({ ...base, expiresAt: '2026-11-19T07:59:59Z' }, NOW), {
    status: 'expired', expiring: false,
  });
  assert.deepEqual(computeStatus({ ...base, validFrom: '2026-11-20T08:00:00Z' }, NOW), {
    status: 'scheduled', expiring: false,
  });
  assert.deepEqual(computeStatus({ ...base, expiresAt: '2026-11-21T08:00:00Z' }, NOW), {
    status: 'active', expiring: true,
  });
  assert.deepEqual(computeStatus(base, NOW), { status: 'active', expiring: false });
});

test('update rejects token changes and warns when maxDevices is below registered count', async () => {
  const { service, repository } = createService();
  await service.create(LECTURE_ID, {
    recipientName: 'Cô Lan', expiresAt: '2026-12-01T08:00:00.000Z', maxDevices: 5,
  });
  repository.state.shares[0].device_count = 4;

  await assert.rejects(service.update(SHARE_ID, { token: 'replacement' }), expectCode('VALIDATION_ERROR'));
  const updated = await service.update(SHARE_ID, { maxDevices: 3, maxConcurrent: 2 }, USER_ID);
  assert.equal(updated.share.maxDevices, 3);
  assert.equal(updated.warnings[0].code, 'MAX_DEVICES_BELOW_CURRENT');
  assert.equal(repository.state.logs.at(-1).event, 'share_updated');
});

test('revoke is irreversible and ends durable and live sessions', async () => {
  const { service, repository, sessionCalls } = createService();
  await service.create(LECTURE_ID, {
    recipientName: 'Cô Lan', expiresAt: '2026-12-01T08:00:00.000Z',
  });
  const revoked = await service.revoke(SHARE_ID, { reason: 'Đã hoàn tất' }, USER_ID);

  assert.equal(revoked.status, 'revoked');
  assert.equal(repository.endedShare, 1);
  assert.deepEqual(sessionCalls, [['share', SHARE_ID, 'revoked']]);
  assert.equal(repository.state.logs.at(-1).event, 'share_revoked');

  await service.revoke(SHARE_ID, {}, USER_ID);
  assert.equal(repository.endedShare, 1);
  assert.equal(sessionCalls.length, 1);
});

test('device operations list, remove, block and unblock with audit events', async () => {
  const { service, repository, sessionCalls } = createService();
  await service.create(LECTURE_ID, {
    recipientName: 'Cô Lan', expiresAt: '2026-12-01T08:00:00.000Z',
  });

  assert.equal((await service.listDevices(SHARE_ID))[0].deviceRef, DEVICE_ID);
  await service.blockDevice(SHARE_ID, DEVICE_ID, USER_ID);
  await service.unblockDevice(SHARE_ID, DEVICE_ID, USER_ID);
  await service.removeDevice(SHARE_ID, DEVICE_ID, USER_ID);

  assert.equal(repository.endedDevice, 2);
  assert.deepEqual(sessionCalls.map(call => call[0]), ['device', 'device']);
  assert.deepEqual(repository.state.logs.slice(-3).map(log => log.event), [
    'device_blocked', 'device_unblocked', 'device_removed',
  ]);
});

test('view-only permission cannot create shares', () => {
  const router = require('../src/routes/secureLectureRoutes');
  const route = router.stack.find(layer => layer.route?.path === '/lectures/:id/shares'
    && layer.route.methods.post).route;
  const permissionMiddleware = route.stack[0].handle;
  let deniedError;

  permissionMiddleware(
    { auth: { userId: USER_ID, permissions: ['secure_lectures.view'] } },
    {},
    error => { deniedError = error; },
  );

  assert.equal(deniedError.statusCode, 403);
  assert.equal(deniedError.code, 'PERMISSION_DENIED');
});

test('lecture detail uses share/device values while later-phase metrics remain zero', async () => {
  const service = createLectureService({
    repository: {
      async findById() {
        return {
          id: LECTURE_ID,
          currentVersion: { versionNo: 4 },
          shareStatusSummary: { active: 3, scheduled: 1, expired: 2, revoked: 1 },
          registeredDeviceCount: 7,
        };
      },
    },
    versions: {},
  });

  const detail = await service.detail(LECTURE_ID);
  assert.deepEqual(detail.metrics, {
    currentVersion: 4,
    activeShareCount: 3,
    revokedShareCount: 1,
    expiredShareCount: 2,
    registeredDeviceCount: 7,
    liveSessionCount: 0,
    openOk7d: 0,
    deniedCount: 0,
    takeoverCount: 0,
  });
});

test('overview returns share/device-derived aggregates from its scoped query', async () => {
  let sql;
  const repository = createLectureRepository({
    database: {
      async query(statement) {
        sql = statement;
        return { rows: [{
          total_lectures: 5,
          active_share_count: 4,
          unique_recipient_count: 3,
          attention_count: 2,
        }] };
      },
    },
  });

  assert.deepEqual(await repository.overview(), {
    totalLectures: 5,
    activeShareCount: 4,
    uniqueRecipientCount: 3,
    liveSessionCount: 0,
    attentionCount: 2,
  });
  assert.match(sql, /FROM sl_shares/);
  assert.match(sql, /FROM sl_devices/);
});

test('unblock device SQL binds only parameters referenced by the query', async () => {
  let parameters;
  const { createShareRepository } = require(
    '../src/modules/secure-lectures/repositories/shareRepository'
  );
  const repository = createShareRepository({ database: {} });
  const client = {
    async query(_sql, values) {
      parameters = values;
      return { rows: [{ id: DEVICE_ID }] };
    },
  };

  await repository.mutateDevice(client, SHARE_ID, DEVICE_ID, 'unblock', USER_ID);
  assert.deepEqual(parameters, [SHARE_ID, DEVICE_ID]);
});
