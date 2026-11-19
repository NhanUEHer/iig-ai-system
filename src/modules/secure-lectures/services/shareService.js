const config = require('../config');
const { SecureLectureError } = require('../errors');
const { createShareRepository } = require('../repositories/shareRepository');
const { sessionStore } = require('../stores/runtimeStores');
const tokenService = require('./tokenService');
const { requireUuid } = require('./folderService');
const HttpError = require('../../../http/httpError');

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_VALID_DAYS = 365;
const EXPIRING_MS = 3 * DAY_MS;
const defaultSessionStore = sessionStore;

function validation(message) {
  throw new HttpError(message, 400, 'VALIDATION_ERROR');
}

function requiredText(value, field, maxLength) {
  const text = String(value ?? '').trim();
  if (!text || text.length > maxLength) validation(`${field} không hợp lệ.`);
  return text;
}

function optionalText(value, field, maxLength) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (text.length > maxLength) validation(`${field} quá dài.`);
  return text || null;
}

function requireDate(value, field) {
  const date = value instanceof Date ? new Date(value) : new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) validation(`${field} phải là thời gian hợp lệ.`);
  return date;
}

function requireInteger(value, field, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    validation(`${field} phải là số nguyên từ ${min} đến ${max}.`);
  }
  return number;
}

function optionalUuid(value, field) {
  if (value === undefined || value === null || value === '') return null;
  return requireUuid(value, field);
}

function computeStatus(share, now = new Date()) {
  const current = now instanceof Date ? now : new Date(now);
  const validFrom = new Date(share.validFrom ?? share.valid_from);
  const expiresAt = new Date(share.expiresAt ?? share.expires_at);
  const revokedAt = share.revokedAt ?? share.revoked_at;
  let status = 'active';
  if (revokedAt) status = 'revoked';
  else if (expiresAt <= current) status = 'expired';
  else if (validFrom > current) status = 'scheduled';
  return {
    status,
    expiring: status === 'active' && expiresAt.getTime() - current.getTime() <= EXPIRING_MS,
  };
}

function mapShare(row, now = new Date()) {
  if (!row) return null;
  const share = {
    id: row.id,
    lectureId: row.lecture_id,
    pinnedVersionId: row.pinned_version_id,
    tokenHint: row.token_hint,
    recipientName: row.recipient_name,
    recipientEmail: row.recipient_email,
    recipientUserId: row.recipient_user_id,
    validFrom: row.valid_from,
    expiresAt: row.expires_at,
    maxDevices: Number(row.max_devices),
    maxConcurrent: Number(row.max_concurrent),
    watermarkEnabled: row.watermark_enabled,
    guardEnabled: row.guard_enabled,
    note: row.note,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
    revokeReason: row.revoke_reason,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deviceCount: Number(row.device_count || 0),
    liveSessionCount: Number(row.live_session_count || 0),
  };
  return { ...share, ...computeStatus(share, now) };
}

function mapDevice(row) {
  return {
    deviceRef: row.id,
    deviceId: row.device_id,
    shareId: row.share_id,
    fingerprint: row.fingerprint,
    label: row.label,
    userAgent: row.user_agent,
    firstIp: row.first_ip,
    lastIp: row.last_ip,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    removedAt: row.removed_at,
    blockedAt: row.blocked_at,
    liveSessions: row.live_sessions || [],
  };
}

function normalizeBaseUrl(baseUrl) {
  const value = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!value) validation('Không xác định được PUBLIC_BASE_URL.');
  return value;
}

function validateWindow({ validFrom, expiresAt }, now) {
  if (expiresAt <= now) validation('expiresAt phải ở tương lai.');
  if (expiresAt <= validFrom) validation('expiresAt phải sau validFrom.');
  if (expiresAt.getTime() - validFrom.getTime() > MAX_VALID_DAYS * DAY_MS) {
    validation(`Thời hạn link không được vượt quá ${MAX_VALID_DAYS} ngày.`);
  }
}

function createShareService({
  repository = createShareRepository(),
  sessions = defaultSessionStore,
  tokens = tokenService,
  now = () => new Date(),
  publicBaseUrl = config.publicBaseUrl,
} = {}) {
  async function create(lectureId, input = {}, userId = null, requestBaseUrl = null) {
    requireUuid(lectureId, 'lectureId');
    const baseUrl = normalizeBaseUrl(publicBaseUrl || requestBaseUrl);
    const current = now();
    const validFrom = input.validFrom === undefined ? current : requireDate(input.validFrom, 'validFrom');
    const expiresAt = requireDate(input.expiresAt, 'expiresAt');
    validateWindow({ validFrom, expiresAt }, current);
    const maxDevices = input.maxDevices === undefined
      ? 3 : requireInteger(input.maxDevices, 'maxDevices', 1, 20);
    const maxConcurrent = input.maxConcurrent === undefined
      ? 1 : requireInteger(input.maxConcurrent, 'maxConcurrent', 1, maxDevices);
    if (maxConcurrent > maxDevices) validation('maxConcurrent không được lớn hơn maxDevices.');

    const token = tokens.generate();
    const values = {
      lectureId,
      pinnedVersionId: optionalUuid(input.pinnedVersionId, 'pinnedVersionId'),
      tokenHash: tokens.hash(token),
      tokenHint: token.slice(-4),
      recipientName: requiredText(input.recipientName, 'recipientName', 200),
      recipientEmail: optionalText(input.recipientEmail, 'recipientEmail', 320),
      validFrom,
      expiresAt,
      maxDevices,
      maxConcurrent,
      watermarkEnabled: input.watermarkEnabled === undefined ? true : Boolean(input.watermarkEnabled),
      guardEnabled: input.guardEnabled === undefined ? true : Boolean(input.guardEnabled),
      note: optionalText(input.note, 'note', 2000),
      userId,
    };

    const row = await repository.transaction(async client => {
      const inserted = await repository.create(client, values);
      if (!inserted) {
        throw new SecureLectureError(
          'LECTURE_NOT_READY',
          'Bài giảng đã lưu trữ, chưa có phiên bản hoặc bản cố định không hợp lệ.',
        );
      }
      await repository.log(client, {
        lectureId,
        shareId: inserted.id,
        userId,
        event: 'share_created',
      });
      return inserted;
    });
    return { share: mapShare(row, current), token, url: `${baseUrl}/v/${token}` };
  }

  async function list(lectureId) {
    requireUuid(lectureId, 'lectureId');
    const current = now();
    return (await repository.list(lectureId)).map(row => mapShare(row, current));
  }

  async function update(id, input = {}, userId = null) {
    requireUuid(id, 'id');
    const currentRow = await repository.findById(id);
    if (!currentRow) throw new HttpError('Link chia sẻ không tồn tại.', 404, 'SHARE_NOT_FOUND');
    if (Object.hasOwn(input, 'token') || Object.hasOwn(input, 'tokenHash')
      || Object.hasOwn(input, 'token_hash')) {
      validation('Không được thay đổi token của link.');
    }

    const changes = {};
    if (input.recipientName !== undefined) {
      changes.recipientName = requiredText(input.recipientName, 'recipientName', 200);
    }
    if (input.recipientEmail !== undefined) {
      changes.recipientEmail = optionalText(input.recipientEmail, 'recipientEmail', 320);
    }
    if (input.pinnedVersionId !== undefined) {
      changes.pinnedVersionId = optionalUuid(input.pinnedVersionId, 'pinnedVersionId');
    }
    if (input.validFrom !== undefined) changes.validFrom = requireDate(input.validFrom, 'validFrom');
    if (input.expiresAt !== undefined) changes.expiresAt = requireDate(input.expiresAt, 'expiresAt');
    if (input.maxDevices !== undefined) {
      changes.maxDevices = requireInteger(input.maxDevices, 'maxDevices', 1, 20);
    }
    if (input.maxConcurrent !== undefined) {
      changes.maxConcurrent = requireInteger(input.maxConcurrent, 'maxConcurrent', 1, 20);
    }
    if (input.watermarkEnabled !== undefined) changes.watermarkEnabled = Boolean(input.watermarkEnabled);
    if (input.guardEnabled !== undefined) changes.guardEnabled = Boolean(input.guardEnabled);
    if (input.note !== undefined) changes.note = optionalText(input.note, 'note', 2000);
    if (!Object.keys(changes).length) return { share: mapShare(currentRow, now()), warnings: [] };

    const validFrom = changes.validFrom || new Date(currentRow.valid_from);
    const expiresAt = changes.expiresAt || new Date(currentRow.expires_at);
    validateWindow({ validFrom, expiresAt }, now());
    const maxDevices = changes.maxDevices ?? Number(currentRow.max_devices);
    const maxConcurrent = changes.maxConcurrent ?? Number(currentRow.max_concurrent);
    if (maxConcurrent > maxDevices) validation('maxConcurrent không được lớn hơn maxDevices.');

    const warnings = [];
    if (changes.maxDevices !== undefined && changes.maxDevices < Number(currentRow.device_count || 0)) {
      warnings.push({
        code: 'MAX_DEVICES_BELOW_CURRENT',
        message: `Link đang có ${currentRow.device_count} thiết bị; thiết bị mới sẽ bị chặn.`,
      });
    }

    const row = await repository.transaction(async client => {
      if (Object.hasOwn(changes, 'pinnedVersionId')
        && !await repository.pinnedVersionBelongsToLecture(
          client, currentRow.lecture_id, changes.pinnedVersionId,
        )) {
        throw new SecureLectureError('LECTURE_NOT_READY', 'Bản cố định không thuộc bài giảng này.');
      }
      await repository.update(client, id, changes, userId);
      await repository.log(client, {
        lectureId: currentRow.lecture_id,
        shareId: id,
        userId,
        event: 'share_updated',
      });
      return repository.findById(id, client);
    });
    return { share: mapShare(row, now()), warnings };
  }

  async function revoke(id, input = {}, userId = null) {
    requireUuid(id, 'id');
    const reason = optionalText(input.reason, 'reason', 1000);
    const result = await repository.transaction(async client => {
      const current = await repository.findById(id, client);
      if (!current) throw new HttpError('Link chia sẻ không tồn tại.', 404, 'SHARE_NOT_FOUND');
      if (current.revoked_at) return { row: current, newlyRevoked: false };
      const row = await repository.revoke(client, id, reason, userId);
      await repository.endSessionsForShare(client, id, 'revoked');
      await repository.log(client, {
        lectureId: current.lecture_id,
        shareId: id,
        userId,
        event: 'share_revoked',
        meta: reason ? { reason } : {},
      });
      return { row, newlyRevoked: true };
    });
    if (result.newlyRevoked) await sessions.endAllForShare(id, 'revoked');
    return mapShare(result.row, now());
  }

  async function listDevices(shareId) {
    requireUuid(shareId, 'shareId');
    if (!await repository.findById(shareId)) {
      throw new HttpError('Link chia sẻ không tồn tại.', 404, 'SHARE_NOT_FOUND');
    }
    return (await repository.listDevices(shareId)).map(mapDevice);
  }

  async function mutateDevice(shareId, deviceRef, action, userId) {
    requireUuid(shareId, 'shareId');
    requireUuid(deviceRef, 'deviceRef');
    const events = {
      remove: 'device_removed',
      block: 'device_blocked',
      unblock: 'device_unblocked',
    };
    const result = await repository.transaction(async client => {
      const share = await repository.findById(shareId, client);
      if (!share) throw new HttpError('Link chia sẻ không tồn tại.', 404, 'SHARE_NOT_FOUND');
      const device = await repository.mutateDevice(client, shareId, deviceRef, action, userId);
      if (!device) throw new HttpError('Thiết bị không tồn tại.', 404, 'DEVICE_NOT_FOUND');
      if (action === 'remove' || action === 'block') {
        await repository.endSessionsForDevice(client, deviceRef);
      }
      await repository.log(client, {
        lectureId: share.lecture_id,
        shareId,
        deviceRef,
        userId,
        event: events[action],
      });
      return device;
    });
    if (action === 'remove' || action === 'block') {
      await sessions.endAllForDevice(deviceRef, 'device_removed');
    }
    return mapDevice(result);
  }

  const removeDevice = (shareId, deviceRef, userId) => (
    mutateDevice(shareId, deviceRef, 'remove', userId)
  );
  const blockDevice = (shareId, deviceRef, userId) => (
    mutateDevice(shareId, deviceRef, 'block', userId)
  );
  const unblockDevice = (shareId, deviceRef, userId) => (
    mutateDevice(shareId, deviceRef, 'unblock', userId)
  );

  return { create, list, update, revoke, listDevices, removeDevice, blockDevice, unblockDevice };
}

const service = createShareService();
module.exports = {
  ...service,
  createShareService,
  computeStatus,
  mapShare,
  mapDevice,
  MAX_VALID_DAYS,
};
