const HttpError = require('../../../http/httpError');
const { requireUuid } = require('./folderService');
const { createLogRepository } = require('../repositories/logRepository');

function requireDate(value, field) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new HttpError(`${field} không hợp lệ.`, 400, 'VALIDATION_ERROR');
  return date.toISOString();
}

function createLogService({ repository = createLogRepository() } = {}) {
  async function list(query = {}) {
    const limit = query.limit === undefined ? 50 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError('limit phải từ 1 đến 100.', 400, 'VALIDATION_ERROR');
    const lectureId = query.lectureId ? requireUuid(query.lectureId, 'lectureId') : null;
    const shareId = query.shareId ? requireUuid(query.shareId, 'shareId') : null;
    const event = String(query.event || '').trim() || null;
    if (event && (event.length > 64 || !/^[a-z0-9_]+$/.test(event))) throw new HttpError('event không hợp lệ.', 400, 'VALIDATION_ERROR');
    let beforeId = null;
    if (query.cursor) {
      try {
        const parsed = JSON.parse(Buffer.from(String(query.cursor), 'base64url').toString('utf8'));
        if (!/^\d+$/.test(String(parsed.beforeId || ''))) throw new Error('invalid');
        beforeId = String(parsed.beforeId);
      } catch (_error) { throw new HttpError('cursor không hợp lệ.', 400, 'VALIDATION_ERROR'); }
    }
    const from = requireDate(query.from, 'from');
    const to = requireDate(query.to, 'to');
    if (from && to && new Date(from) > new Date(to)) throw new HttpError('from phải trước to.', 400, 'VALIDATION_ERROR');
    const rows = await repository.list({ lectureId, shareId, event, denied: String(query.denied || '') === 'true', from, to, beforeId, limit });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    return { items, nextCursor: hasMore ? Buffer.from(JSON.stringify({ beforeId: items.at(-1).id }), 'utf8').toString('base64url') : null };
  }
  return { list };
}

const service = createLogService();
module.exports = { ...service, createLogService, requireDate };
