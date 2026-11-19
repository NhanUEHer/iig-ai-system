const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const { Duplex } = require('node:stream');
const test = require('node:test');

const express = require('express');

const { sameOriginOnly } = require('../src/http/sameOriginOnly');
const { createSecureLectureRoutes } = require('../src/routes/secureLectureRoutes');
const { createSecureLecturePublicRoutes } = require('../src/routes/secureLecturePublicRoutes');
const { createAccessEngine } = require('../src/modules/secure-lectures/services/accessEngine');
const { createContentService } = require('../src/modules/secure-lectures/services/contentService');
const { createShareService } = require('../src/modules/secure-lectures/services/shareService');
const tokenService = require('../src/modules/secure-lectures/services/tokenService');
const { createMemoryBlobStore } = require('../src/modules/secure-lectures/stores/blobStore');
const { createMemoryRateLimitStore } = require('../src/modules/secure-lectures/stores/rateLimitStore');
const { createMemorySessionStore } = require('../src/modules/secure-lectures/stores/sessionStore');
const { createMemoryTicketStore } = require('../src/modules/secure-lectures/stores/ticketStore');

const USER_ID = '10000000-0000-4000-8000-000000000001';
const START = Date.parse('2026-11-19T08:00:00.000Z');

function createStateRepository(state) {
  const findShare = id => state.shares.find(share => share.id === id) || null;
  const findDevice = id => state.devices.find(device => device.id === id) || null;
  const findSession = id => state.sessions.find(session => session.id === id) || null;
  const activeSession = (session, now, ttlSec) => !session.ended_at
    && new Date(session.last_heartbeat_at).getTime() + ttlSec * 1000 >= now.getTime();

  return {
    async transaction(work) { return work({}); },
    async lockShareByToken(_client, tokenHash) {
      const share = state.shares.find(item => item.token_hash === tokenHash);
      if (!share) return null;
      const lecture = state.lectures.find(item => item.id === share.lecture_id);
      return {
        ...share,
        archived_at: lecture?.archived_at || null,
        lecture_title: lecture?.title,
        version_id: share.pinned_version_id || lecture?.current_version_id,
      };
    },
    async findDevice(_client, shareId, deviceId) {
      return state.devices.find(item => item.share_id === shareId && item.device_id === deviceId) || null;
    },
    async touchDevice(_client, id, details) {
      const device = findDevice(id);
      Object.assign(device, {
        fingerprint: details.fingerprint,
        label: details.label,
        user_agent: details.userAgent,
        last_ip: details.ip,
        last_seen_at: details.now,
      });
      return device;
    },
    async activeDeviceCount(_client, shareId) {
      return state.devices.filter(item => item.share_id === shareId && !item.removed_at).length;
    },
    async registerDevice(_client, input) {
      let device = input.existingId ? findDevice(input.existingId) : null;
      if (!device) {
        device = {
          id: crypto.randomUUID(), share_id: input.shareId, device_id: input.deviceId,
          first_seen_at: input.now, first_ip: input.ip,
        };
        state.devices.push(device);
      }
      Object.assign(device, {
        fingerprint: input.fingerprint,
        label: input.label,
        user_agent: input.userAgent,
        last_ip: input.ip,
        last_seen_at: input.now,
        removed_at: null,
        blocked_at: null,
      });
      return device;
    },
    async reserveSession(_client, session, maxConcurrent, now, ttlSec) {
      for (const current of state.sessions) {
        if (current.share_id === session.shareId && current.device_ref === session.deviceRef
          && activeSession(current, now, ttlSec)) {
          current.ended_at = now;
          current.end_reason = 'replaced';
        }
      }
      const liveSessions = state.sessions.filter(current => current.share_id === session.shareId
        && activeSession(current, now, ttlSec));
      if (liveSessions.length >= maxConcurrent) {
        return { acquired: false, liveSessions: liveSessions.map(current => ({
          id: current.id,
          deviceLabel: findDevice(current.device_ref)?.label,
          startedAt: current.started_at,
        })) };
      }
      state.sessions.push({
        id: session.id,
        share_id: session.shareId,
        device_ref: session.deviceRef,
        version_id: session.versionId,
        started_at: session.startedAt,
        last_heartbeat_at: session.lastHeartbeatAt,
        ended_at: null,
        end_reason: null,
        kicked_by_session_id: null,
      });
      return { acquired: true };
    },
    async endSessions(_client, ids, reason) {
      for (const id of ids) await this.endSession(id, reason);
    },
    async sessionContext(id) {
      const session = findSession(id);
      if (!session) return null;
      const share = findShare(session.share_id);
      const lecture = state.lectures.find(item => item.id === share.lecture_id);
      const device = findDevice(session.device_ref);
      return {
        ...session,
        lecture_id: share.lecture_id,
        revoked_at: share.revoked_at,
        expires_at: share.expires_at,
        lecture_archived_at: lecture?.archived_at,
        removed_at: device?.removed_at,
        blocked_at: device?.blocked_at,
      };
    },
    async endSession(id, reason, kickedBy = null) {
      const session = findSession(id);
      if (!session || session.ended_at) return session;
      session.ended_at = new Date(state.nowMs);
      session.end_reason = reason;
      session.kicked_by_session_id = kickedBy;
      return session;
    },
    async touchDurableSession(id, now) {
      const session = findSession(id);
      if (session) session.last_heartbeat_at = now;
      return session;
    },
    async log(_client, entry) { state.logs.push({ ...entry }); },
  };
}

function createShareRepository(state) {
  const find = id => state.shares.find(share => share.id === id) || null;
  return {
    async transaction(work) { return work({}); },
    async create(_client, input) {
      const lecture = state.lectures.find(item => item.id === input.lectureId && !item.archived_at);
      if (!lecture?.current_version_id) return null;
      const row = {
        id: crypto.randomUUID(), lecture_id: input.lectureId,
        pinned_version_id: input.pinnedVersionId, token_hash: input.tokenHash,
        token_hint: input.tokenHint, recipient_name: input.recipientName,
        recipient_email: input.recipientEmail, valid_from: input.validFrom,
        expires_at: input.expiresAt, max_devices: input.maxDevices,
        max_concurrent: input.maxConcurrent, watermark_enabled: input.watermarkEnabled,
        guard_enabled: input.guardEnabled, note: input.note, revoked_at: null,
        created_by: input.userId, updated_by: input.userId,
        created_at: new Date(state.nowMs), updated_at: new Date(state.nowMs),
      };
      state.shares.push(row);
      return row;
    },
    async findById(id) {
      const row = find(id);
      if (!row) return null;
      return { ...row, device_count: state.devices.filter(device => (
        device.share_id === id && !device.removed_at
      )).length };
    },
    async update(_client, id, changes, userId) {
      const row = find(id);
      const columns = {
        recipientName: 'recipient_name', recipientEmail: 'recipient_email',
        pinnedVersionId: 'pinned_version_id', validFrom: 'valid_from', expiresAt: 'expires_at',
        maxDevices: 'max_devices', maxConcurrent: 'max_concurrent',
        watermarkEnabled: 'watermark_enabled', guardEnabled: 'guard_enabled', note: 'note',
      };
      for (const [key, value] of Object.entries(changes)) row[columns[key]] = value;
      row.updated_by = userId;
      return row;
    },
    async pinnedVersionBelongsToLecture() { return true; },
    async revoke(_client, id, reason, userId) {
      const row = find(id);
      row.revoked_at = new Date(state.nowMs);
      row.revoked_by = userId;
      row.revoke_reason = reason;
      return row;
    },
    async endSessionsForShare(_client, shareId, reason) {
      for (const session of state.sessions) {
        if (session.share_id === shareId && !session.ended_at) {
          session.ended_at = new Date(state.nowMs);
          session.end_reason = reason;
        }
      }
    },
    async listDevices(shareId) {
      return state.devices.filter(device => device.share_id === shareId);
    },
    async mutateDevice(_client, shareId, deviceRef, action) {
      const device = state.devices.find(item => item.share_id === shareId && item.id === deviceRef);
      if (!device) return null;
      if (action === 'remove') device.removed_at = new Date(state.nowMs);
      if (action === 'block') device.blocked_at = new Date(state.nowMs);
      if (action === 'unblock') device.blocked_at = null;
      return device;
    },
    async endSessionsForDevice(_client, deviceRef) {
      for (const session of state.sessions) {
        if (session.device_ref === deviceRef && !session.ended_at) {
          session.ended_at = new Date(state.nowMs);
          session.end_reason = 'device_removed';
        }
      }
    },
    async log(_client, entry) { state.logs.push({ ...entry }); },
  };
}

function createAdminServices(state, blobs, sessions) {
  const shareService = createShareService({
    repository: createShareRepository(state),
    sessions,
    now: () => new Date(state.nowMs),
    publicBaseUrl: 'https://lectures.example.test',
  });
  return {
    folders: {
      async create(input) {
        const folder = { id: crypto.randomUUID(), name: String(input.name), parentId: null };
        state.folders.push(folder);
        return folder;
      },
      async list() { return { items: state.folders, unfiledCount: 0 }; },
    },
    lectures: {
      async create(input, file) {
        assert.equal(file?.mimetype, 'text/html');
        assert.match(file.buffer.toString('utf8'), /<html/i);
        const lecture = {
          id: crypto.randomUUID(), folder_id: input.folderId, title: input.title,
          current_version_id: crypto.randomUUID(), archived_at: null,
        };
        const storageKey = `secure-lectures/${lecture.id}/v1-e2e.html`;
        await blobs.put(storageKey, file.buffer);
        state.lectures.push(lecture);
        state.versions.push({ id: lecture.current_version_id, lecture_id: lecture.id, storage_key: storageKey });
        return lecture;
      },
    },
    shares: shareService,
  };
}

function createCookieJar() {
  let cookie = '';
  return {
    header() { return cookie; },
    remember(response) {
      const value = response.headers.get('set-cookie');
      if (value) cookie = value.split(';', 1)[0];
    },
  };
}

async function startFixture() {
  const state = {
    nowMs: START, folders: [], lectures: [], versions: [], shares: [], devices: [], sessions: [], logs: [],
  };
  const repository = createStateRepository(state);
  const sessions = createMemorySessionStore({ now: () => state.nowMs });
  const tickets = createMemoryTicketStore({ now: () => state.nowMs });
  const blobs = createMemoryBlobStore();
  const engine = createAccessEngine({
    repository, sessions, tickets, now: () => new Date(state.nowMs),
    sessionTtlSec: 90, heartbeatSec: 30, ticketTtlSec: 60,
  });
  const content = createContentService({
    tickets,
    blobs,
    now: () => new Date(state.nowMs),
    repository: {
      async findDelivery(grant) {
        const session = state.sessions.find(item => item.id === grant.sessionId);
        const share = state.shares.find(item => item.id === session?.share_id);
        const version = state.versions.find(item => item.id === grant.versionId);
        if (!session || !share || !version) return null;
        return {
          version_id: version.id, storage_key: version.storage_key,
          share_id: share.id, lecture_id: share.lecture_id,
          recipient_name: share.recipient_name, watermark_enabled: share.watermark_enabled,
          guard_enabled: share.guard_enabled, device_ref: session.device_ref,
        };
      },
      async logOpen(row, sessionId, context) {
        state.logs.push({ event: 'open_ok', shareId: row.share_id, sessionId, ip: context.ip });
      },
    },
  });
  const admin = createAdminServices(state, blobs, sessions);
  const permission = required => (req, _res, next) => (
    req.auth.permissions.includes(required)
      ? next()
      : next(Object.assign(new Error('Bạn không có quyền.'), { statusCode: 403, code: 'PERMISSION_DENIED' }))
  );
  const app = express();
  app.use(express.json());
  app.use('/api/public/lectures', sameOriginOnly);
  app.use('/api/public/lectures', createSecureLecturePublicRoutes({
    engine, content, limits: createMemoryRateLimitStore({ now: () => state.nowMs }),
  }));
  app.use('/api/secure-lectures', (req, _res, next) => {
    req.auth = {
      userId: USER_ID,
      permissions: req.get('x-test-role') === 'view'
        ? ['secure_lectures.view']
        : ['secure_lectures.view', 'secure_lectures.manage', 'secure_lectures.share'],
    };
    next();
  }, createSecureLectureRoutes({ ...admin, access: engine, content, permission }));
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({
    success: false,
    error: { code: error.code || 'UNKNOWN', message: error.message },
  }));
  async function inject(path, method, headers, body) {
    const socket = new Duplex({
      read() {},
      write(_chunk, _encoding, callback) { callback(); },
    });
    Object.defineProperty(socket, 'remoteAddress', { value: '127.0.0.1' });
    const req = new http.IncomingMessage(socket);
    req.method = method;
    req.url = path;
    req.headers = Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value)]),
    );
    req.rawHeaders = Object.entries(req.headers).flatMap(([name, value]) => [name, value]);
    req.complete = true;
    const res = new http.ServerResponse(req);
    res.assignSocket(socket);
    let resolveFinished;
    const finished = new Promise(resolve => { resolveFinished = resolve; });
    const responseChunks = [];
    res.write = function write(chunk, encoding) {
      if (chunk) responseChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      return true;
    };
    res.end = function end(chunk, encoding) {
      if (chunk) responseChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      this.finished = true;
      this.emit('finish');
      setImmediate(resolveFinished);
      return this;
    };
    res.once('error', error => {
      throw error;
    });
    app(req, res);
    if (body?.length) req.push(body);
    req.push(null);
    await finished;
    const responseHeaders = res.getHeaders();
    return {
      status: res.statusCode,
      headers: {
        get(name) {
          const value = responseHeaders[String(name).toLowerCase()];
          return Array.isArray(value) ? value.join(', ') : value == null ? null : String(value);
        },
      },
      text: Buffer.concat(responseChunks).toString('utf8'),
    };
  }

  async function request(path, { method = 'GET', body, headers = {}, jar } = {}) {
    const requestHeaders = { 'sec-fetch-site': 'same-origin', ...headers };
    if (jar?.header()) requestHeaders.cookie = jar.header();
    let requestBody = body;
    if (body instanceof FormData) {
      const serialized = new Request('http://express.test', { method, body });
      requestHeaders['content-type'] = serialized.headers.get('content-type');
      requestBody = Buffer.from(await serialized.arrayBuffer());
    } else if (body && typeof body !== 'string') {
      requestHeaders['content-type'] = 'application/json';
      requestBody = JSON.stringify(body);
    }
    if (typeof requestBody === 'string') requestBody = Buffer.from(requestBody);
    if (requestBody) requestHeaders['content-length'] = requestBody.length;
    const injected = await inject(path, method, requestHeaders, requestBody);
    const response = { status: injected.status, headers: injected.headers };
    jar?.remember(response);
    const { text } = injected;
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { response, data, text };
  }
  return { state, request };
}

test('S10 E2E: admin workflow, two cookie jars, limits, takeover, revoke, expiry and one-time ticket', async () => {
  const fixture = await startFixture();
  const { request, state } = fixture;

  const forbidden = await request('/api/secure-lectures/folders', {
    method: 'POST', headers: { 'x-test-role': 'view' }, body: { name: 'Không được tạo' },
  });
  assert.equal(forbidden.response.status, 403);
  assert.equal(forbidden.data.error.code, 'PERMISSION_DENIED');

  const folder = await request('/api/secure-lectures/folders', {
    method: 'POST', body: { name: 'TOEIC nội bộ' },
  });
  assert.equal(folder.response.status, 201);

  const form = new FormData();
  form.set('title', 'Part 1 - Photographs');
  form.set('folderId', folder.data.data.id);
  form.set('file', new Blob([
    '<!doctype html><html><head><script>fetch("https://evil.example")</script></head><body>Slide 1</body></html>',
  ], { type: 'text/html' }), 'lecture.html');
  const lecture = await request('/api/secure-lectures/lectures', { method: 'POST', body: form });
  assert.equal(lecture.response.status, 201, JSON.stringify(lecture.data));

  const expiresAt = new Date(START + 24 * 60 * 60 * 1000).toISOString();
  const created = await request(`/api/secure-lectures/lectures/${lecture.data.data.id}/shares`, {
    method: 'POST',
    body: { recipientName: 'Cô Lan', expiresAt, maxDevices: 3, maxConcurrent: 1 },
  });
  assert.equal(created.response.status, 201);
  const { token, share } = created.data.data;
  assert.ok(token);
  assert.equal(state.shares[0].token_hash, tokenService.hash(token));
  assert.equal(JSON.stringify(state.logs).includes(token), false);

  const jarA = createCookieJar();
  const jarB = createCookieJar();
  const jarC = createCookieJar();
  const jarD = createCookieJar();
  const open = jar => request('/api/public/lectures/session', {
    method: 'POST', jar, body: { token, client: { platform: 'node-e2e' } },
  });

  const openedA = await open(jarA);
  assert.equal(openedA.response.status, 201);
  const blockedB = await open(jarB);
  assert.equal(blockedB.response.status, 409);
  assert.equal(blockedB.data.error.code, 'CONCURRENT_LIMIT');

  const takeoverB = await request('/api/public/lectures/session/takeover', {
    method: 'POST', jar: jarB,
    body: { token, kickSessionId: openedA.data.data.sessionId, client: { platform: 'node-e2e' } },
  });
  assert.equal(takeoverB.response.status, 201);
  const heartbeatA = await request('/api/public/lectures/heartbeat', {
    method: 'POST', jar: jarA, body: { sessionId: openedA.data.data.sessionId },
  });
  assert.equal(heartbeatA.response.status, 409);
  assert.equal(heartbeatA.data.error.code, 'SESSION_KICKED');

  await request('/api/public/lectures/end', {
    method: 'POST', jar: jarB, headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ sessionId: takeoverB.data.data.sessionId }),
  });
  const openedC = await open(jarC);
  assert.equal(openedC.response.status, 201);
  const blockedD = await open(jarD);
  assert.equal(blockedD.response.status, 403);
  assert.equal(blockedD.data.error.code, 'DEVICE_LIMIT');

  const devices = await request(`/api/secure-lectures/shares/${share.id}/devices`);
  const cCookie = jarC.header().split('=')[1];
  const deviceC = devices.data.data.find(device => device.deviceId === cCookie);
  assert.ok(deviceC);
  const removed = await request(
    `/api/secure-lectures/shares/${share.id}/devices/${deviceC.deviceRef}/remove`,
    { method: 'POST', body: {} },
  );
  assert.equal(removed.response.status, 200);
  const openedD = await open(jarD);
  assert.equal(openedD.response.status, 201);

  const firstContent = await request(`/api/public/lectures/content/${openedD.data.data.ticket}`, { jar: jarD });
  assert.equal(firstContent.response.status, 200);
  assert.match(firstContent.text, /data-sl-guard/);
  assert.match(firstContent.text, /data-sl-watermark/);
  assert.match(firstContent.response.headers.get('content-security-policy'), /connect-src 'none'/);
  assert.match(firstContent.response.headers.get('content-security-policy'), /sandbox allow-scripts/);
  const reusedContent = await request(`/api/public/lectures/content/${openedD.data.data.ticket}`, { jar: jarD });
  assert.equal(reusedContent.response.status, 404);
  assert.equal(reusedContent.text, '');

  const revoked = await request(`/api/secure-lectures/shares/${share.id}/revoke`, {
    method: 'POST', body: { reason: 'Kết thúc thử nghiệm' },
  });
  assert.equal(revoked.response.status, 200);
  const heartbeatD = await request('/api/public/lectures/heartbeat', {
    method: 'POST', jar: jarD, body: { sessionId: openedD.data.data.sessionId },
  });
  assert.equal(heartbeatD.response.status, 410);
  assert.equal(heartbeatD.data.error.code, 'LINK_REVOKED');

  const expiring = await request(`/api/secure-lectures/lectures/${lecture.data.data.id}/shares`, {
    method: 'POST',
    body: { recipientName: 'Thầy Minh', expiresAt, maxDevices: 3, maxConcurrent: 1 },
  });
  const expiryJar = createCookieJar();
  const expiryOpen = await request('/api/public/lectures/session', {
    method: 'POST', jar: expiryJar, body: { token: expiring.data.data.token, client: {} },
  });
  assert.equal(expiryOpen.response.status, 201);
  state.nowMs = START + 24 * 60 * 60 * 1000 + 1;
  const expired = await request('/api/public/lectures/heartbeat', {
    method: 'POST', jar: expiryJar, body: { sessionId: expiryOpen.data.data.sessionId },
  });
  assert.equal(expired.response.status, 410);
  assert.equal(expired.data.error.code, 'LINK_EXPIRED');
});
