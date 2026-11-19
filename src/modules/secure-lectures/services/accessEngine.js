const crypto = require('node:crypto');
const config = require('../config');
const { SecureLectureError } = require('../errors');
const { createAccessRepository } = require('../repositories/accessRepository');
const { sessionStore, ticketStore } = require('../stores/runtimeStores');
const tokenService = require('./tokenService');
const { requireUuid } = require('./folderService');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const errorMessages = {
  LINK_INVALID: 'Link không hợp lệ.',
  LINK_REVOKED: 'Link đã bị thu hồi.',
  LINK_EXPIRED: 'Link đã hết hạn.',
  LINK_NOT_STARTED: 'Link chưa đến thời gian sử dụng.',
  DEVICE_LIMIT: 'Đã đủ số thiết bị cho link này.',
  DEVICE_BLOCKED: 'Thiết bị này đã bị chặn.',
  DEVICE_REMOVED: 'Thiết bị này đã bị gỡ.',
  CONCURRENT_LIMIT: 'Đã đạt số thiết bị mở cùng lúc.',
  SESSION_KICKED: 'Phiên đã được mở ở thiết bị khác.',
  SESSION_GONE: 'Phiên không còn hoạt động.',
};

function denied(code, data) {
  return new SecureLectureError(code, errorMessages[code], data);
}

function requirePublicSessionId(value) {
  if (!UUID_PATTERN.test(String(value || ''))) throw denied('SESSION_GONE');
  return value;
}

function deviceLabel(userAgent = '') {
  const ua = String(userAgent);
  const browser = /Edg\/(\d+)/.exec(ua) ? `Edge ${RegExp.$1}`
    : /Chrome\/(\d+)/.exec(ua) ? `Chrome ${RegExp.$1}`
      : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${RegExp.$1}`
        : /Version\/(\d+).+Safari/.exec(ua) ? `Safari ${RegExp.$1}` : 'Trình duyệt';
  const platform = /Windows/i.test(ua) ? 'Windows'
    : /(?:iPhone|iPad)/i.test(ua) ? 'iOS'
      : /Android/i.test(ua) ? 'Android'
        : /Mac OS X/i.test(ua) ? 'macOS'
          : /Linux/i.test(ua) ? 'Linux' : 'Thiết bị';
  return `${browser} · ${platform}`;
}

function fingerprint(client = {}, userAgent = '') {
  const value = JSON.stringify({
    ua: String(userAgent).slice(0, 500),
    tz: String(client.tz || '').slice(0, 100),
    screen: String(client.screen || '').slice(0, 100),
    platform: String(client.platform || '').slice(0, 100),
  });
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function publicSession(session) {
  return {
    sessionId: session.id,
    deviceLabel: session.deviceLabel || 'Thiết bị',
    startedAt: session.startedAt,
  };
}

function createAccessEngine({
  repository = createAccessRepository(),
  sessions = sessionStore,
  tickets = ticketStore,
  tokens = tokenService,
  now = () => new Date(),
  heartbeatSec = config.heartbeatSec,
  sessionTtlSec = config.sessionTtlSec,
  ticketTtlSec = config.ticketTtlSec,
} = {}) {
  async function recordDenied(client, share, device, error, ctx) {
    await repository.log(client, {
      lectureId: share?.lecture_id,
      shareId: share?.id,
      deviceRef: device?.id,
      event: 'open_denied',
      reason: error.code,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      meta: error.data || {},
    });
  }

  function validateShare(share, current) {
    if (!share || share.archived_at || !share.version_id) throw denied('LINK_INVALID');
    if (share.revoked_at) throw denied('LINK_REVOKED');
    if (current < new Date(share.valid_from)) {
      throw denied('LINK_NOT_STARTED', { validFrom: share.valid_from });
    }
    if (current > new Date(share.expires_at)) {
      throw denied('LINK_EXPIRED', { expiresAt: share.expires_at });
    }
  }

  async function prepareDevice(client, share, deviceId, ctx, current) {
    let device = await repository.findDevice(client, share.id, deviceId);
    if (device?.blocked_at) throw denied('DEVICE_BLOCKED');
    const details = {
      fingerprint: fingerprint(ctx.client, ctx.userAgent),
      label: deviceLabel(ctx.userAgent),
      userAgent: ctx.userAgent || null,
      ip: ctx.ip || null,
      now: current,
    };
    if (device && !device.removed_at) {
      return { device: await repository.touchDevice(client, device.id, details), registered: false };
    }
    if (await repository.activeDeviceCount(client, share.id) >= Number(share.max_devices)) {
      throw denied('DEVICE_LIMIT', { maxDevices: Number(share.max_devices) });
    }
    device = await repository.registerDevice(client, {
      ...details,
      existingId: device?.id,
      shareId: share.id,
      deviceId,
    });
    await repository.log(client, {
      lectureId: share.lecture_id,
      shareId: share.id,
      deviceRef: device.id,
      event: 'device_registered',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { device, registered: true };
  }

  async function acquire(client, share, device, ctx, current, forcedSessionId = null) {
    const session = {
      id: forcedSessionId || crypto.randomUUID(),
      shareId: share.id,
      deviceRef: device.id,
      deviceId: device.device_id,
      deviceLabel: device.label,
      versionId: share.version_id,
      startedAt: current.toISOString(),
      lastHeartbeatAt: current.toISOString(),
      ip: ctx.ip || null,
      userAgent: ctx.userAgent || null,
    };
    const result = await sessions.acquire(
      session,
      Number(share.max_concurrent),
      current.getTime(),
      sessionTtlSec,
      { client },
    );
    if (result.replaced?.length && sessions.kind !== 'db') {
      await repository.endSessions(client, result.replaced, 'closed');
    }
    if (!result.acquired) {
      throw denied('CONCURRENT_LIMIT', {
        liveSessions: (result.liveSessions || []).map(publicSession),
      });
    }
    if (!result.durableCreated) {
      const durable = await repository.reserveSession(
        client, session, Number(share.max_concurrent), current, sessionTtlSec,
      );
      if (!durable.acquired) {
        await sessions.end(session.id, 'closed');
        throw denied('CONCURRENT_LIMIT', {
          liveSessions: (durable.liveSessions || []).map(publicSession),
        });
      }
    }
    return session;
  }

  async function access(token, deviceId, ctx = {}, takeoverSessionId = null) {
    const current = now();
    let session;
    let share;
    let device;
    let failure;
    let candidateSessionId;
    const wellFormed = tokens.isWellFormed(token);
    const tokenHash = tokens.hash(token || '');
    try {
      await repository.transaction(async client => {
        share = wellFormed ? await repository.lockShareByToken(client, tokenHash) : null;
        try {
          validateShare(share, current);
          ({ device } = await prepareDevice(client, share, deviceId, ctx, current));
          const newSessionId = crypto.randomUUID();
          candidateSessionId = newSessionId;
        if (takeoverSessionId) {
          requirePublicSessionId(takeoverSessionId);
          const target = await repository.sessionContext(takeoverSessionId, client);
          const live = await sessions.get(takeoverSessionId, { client });
          const targetHeartbeat = new Date(
            live?.lastHeartbeatAt || target?.last_heartbeat_at || 0,
          ).getTime();
          if (!target || target.share_id !== share.id || target.device_ref === device.id
            || target.ended_at || !live || live.status !== 'active'
            || targetHeartbeat + sessionTtlSec * 1000 < current.getTime()) {
            throw denied('SESSION_GONE');
          }
          await repository.endSession(takeoverSessionId, 'kicked', newSessionId, client);
          await sessions.kick(takeoverSessionId, newSessionId, { client });
          await repository.log(client, {
            lectureId: share.lecture_id, shareId: share.id, deviceRef: target.device_ref,
            sessionId: takeoverSessionId, event: 'kicked', ip: ctx.ip,
            userAgent: ctx.userAgent,
          });
        }
          session = await acquire(client, share, device, ctx, current, newSessionId);
          if (takeoverSessionId) {
            await repository.log(client, {
              lectureId: share.lecture_id, shareId: share.id, deviceRef: device.id,
              sessionId: session.id, event: 'takeover', ip: ctx.ip,
              userAgent: ctx.userAgent, meta: { kickedSessionId: takeoverSessionId },
            });
          }
        } catch (error) {
          if (!(error instanceof SecureLectureError)) throw error;
          failure = error;
          await recordDenied(client, share, device, error, ctx);
        }
      });
    } catch (error) {
      if (candidateSessionId) await sessions.end(candidateSessionId, 'closed').catch(() => {});
      throw error;
    }
    if (failure) throw failure;

    const ticket = tokens.generate();
    try {
      await tickets.put(ticket, {
        sessionId: session.id,
        versionId: session.versionId,
        deviceId: session.deviceId,
      }, ticketTtlSec);
    } catch (error) {
      await sessions.end(session.id, 'closed').catch(() => {});
      await repository.endSession(session.id, 'closed').catch(() => {});
      throw error;
    }
    return {
      sessionId: session.id,
      ticket,
      heartbeatSec,
      ttlSec: sessionTtlSec,
      lecture: { title: share.lecture_title },
      recipientName: share.recipient_name,
      expiresAt: share.expires_at,
    };
  }

  const open = (token, deviceId, ctx) => access(token, deviceId, ctx);
  const takeover = (token, deviceId, kickSessionId, ctx) => (
    access(token, deviceId, ctx, kickSessionId)
  );

  async function heartbeat(sessionId) {
    requirePublicSessionId(sessionId);
    const current = now();
    const state = await sessions.get(sessionId);
    const row = await repository.sessionContext(sessionId);
    if (state?.status === 'kicked' || row?.end_reason === 'kicked') throw denied('SESSION_KICKED');
    let error;
    let reason;
    if (row?.lecture_archived_at) { error = denied('LINK_INVALID'); reason = 'revoked'; }
    else if (row?.revoked_at) { error = denied('LINK_REVOKED'); reason = 'revoked'; }
    else if (row && current > new Date(row.expires_at)) {
      error = denied('LINK_EXPIRED', { expiresAt: row.expires_at }); reason = 'expired';
    } else if (row?.blocked_at) { error = denied('DEVICE_BLOCKED'); reason = 'device_removed'; }
    else if (row?.removed_at) { error = denied('DEVICE_REMOVED'); reason = 'device_removed'; }
    if (error) {
      await sessions.end(sessionId, reason);
      await repository.endSession(sessionId, reason);
      if (reason === 'expired') {
        await repository.transaction(client => repository.log(client, {
          lectureId: row.lecture_id,
          shareId: row.share_id,
          deviceRef: row.device_ref,
          sessionId,
          event: 'expired',
        }));
      }
      throw error;
    }
    const lastHeartbeat = new Date(state?.lastHeartbeatAt || row?.last_heartbeat_at || 0).getTime();
    if (lastHeartbeat + sessionTtlSec * 1000 < current.getTime()) {
      await sessions.end(sessionId, 'timeout');
      await repository.endSession(sessionId, 'timeout');
      throw denied('SESSION_GONE');
    }
    if (!state || state.status !== 'active' || !row || row.ended_at) throw denied('SESSION_GONE');
    const touched = await sessions.heartbeat(sessionId, current.getTime(), sessionTtlSec);
    if (!touched || touched.status !== 'active') throw denied('SESSION_GONE');
    await repository.touchDurableSession(
      sessionId,
      current,
      sessions.kind === 'db',
      Math.max(1, Math.min(120, Math.floor(sessionTtlSec / 2))),
    );
    return { expiresAt: row.expires_at };
  }

  async function end(sessionId, reason = 'closed') {
    requirePublicSessionId(sessionId);
    const row = await repository.sessionContext(sessionId);
    await sessions.end(sessionId, reason);
    await repository.transaction(async client => {
      await repository.endSession(sessionId, reason, null, client);
      if (row && !row.ended_at) {
        await repository.log(client, {
          lectureId: row.lecture_id,
          shareId: row.share_id,
          deviceRef: row.device_ref,
          sessionId,
          event: 'end',
          meta: { reason },
        });
      }
    });
  }

  async function kick(sessionId, userId = null) {
    requireUuid(sessionId, 'sessionId');
    const row = await repository.transaction(async client => {
      const current = await repository.sessionContext(sessionId, client);
      if (!current || current.ended_at) throw denied('SESSION_GONE');
      await repository.endSession(sessionId, 'kicked', null, client);
      await repository.log(client, {
        lectureId: current.lecture_id, shareId: current.share_id,
        deviceRef: current.device_ref, sessionId, userId, event: 'kicked',
      });
      return current;
    });
    await sessions.kick(sessionId, null);
    return { sessionId: row.id, status: 'kicked' };
  }

  async function event(sessionId, type, ctx = {}) {
    requirePublicSessionId(sessionId);
    if (type !== 'devtools_suspected') throw denied('SESSION_GONE');
    const row = await repository.sessionContext(sessionId);
    if (!row || row.ended_at) throw denied('SESSION_GONE');
    await repository.transaction(client => repository.log(client, {
      lectureId: row.lecture_id, shareId: row.share_id, deviceRef: row.device_ref,
      sessionId, event: type, ip: ctx.ip, userAgent: ctx.userAgent,
    }));
  }

  return { open, takeover, heartbeat, end, kick, event };
}

const service = createAccessEngine();
module.exports = { ...service, createAccessEngine, deviceLabel, fingerprint };
