const HttpError = require('../../http/httpError');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = ['ACCEPTED','FETCHING_SOURCE','SYNCING_EXAM','PREPARING_MEDIA','VALIDATING','READY_FOR_AI','INVALID_REQUEST','SOURCE_FETCH_FAILED','MEDIA_FAILED','INVALID_INPUT','FAILED','QUEUED','TRANSCRIBING','EXTRACTING_FEATURES','SCORING_QUESTIONS','AGGREGATING_GROUPS','CALIBRATING','COMPLETED','COMPLETED_WITH_ISSUES','REVIEW_REQUIRED','CANCELLED'];
const SCOPES = ['S','W','S+W'];

function positiveInt(value, fallback, max) {
  const number = value == null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max) throw new HttpError('Tham số phân trang không hợp lệ.', 400, 'INVALID_PAGINATION');
  return number;
}
function date(value, field) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new HttpError(`${field} không hợp lệ.`, 400, 'INVALID_DATE_FILTER');
  return parsed.toISOString();
}
function validate(query = {}, { exportMode = false } = {}) {
  const search = String(query.search || '').trim();
  const tenantId = String(query.tenantId || '').trim();
  const status = String(query.status || '').trim().toUpperCase();
  const scope = String(query.scope || '').trim().toUpperCase();
  if (tenantId && !UUID.test(tenantId)) throw new HttpError('Tenant không hợp lệ.', 400, 'INVALID_TENANT');
  if (status && !STATUSES.includes(status)) throw new HttpError('Trạng thái không hợp lệ.', 400, 'INVALID_STATUS');
  if (scope && !SCOPES.includes(scope)) throw new HttpError('Phạm vi chấm không hợp lệ.', 400, 'INVALID_SCOPE');
  const from = date(query.from, 'Từ ngày');
  const to = date(query.to, 'Đến ngày');
  if (from && to && new Date(from) > new Date(to)) throw new HttpError('Khoảng thời gian không hợp lệ.', 400, 'INVALID_DATE_RANGE');
  if (exportMode && (!from || !to || new Date(to) - new Date(from) > 31 * 86400000)) throw new HttpError('Xuất dữ liệu yêu cầu khoảng thời gian tối đa 31 ngày.', 400, 'EXPORT_RANGE_REQUIRED');
  return { search, tenantId, status, scope, from, to, hasRetry: query.hasRetry === 'true', page: positiveInt(query.page, 1, 100000), pageSize: positiveInt(query.pageSize, exportMode ? 5000 : 25, exportMode ? 5000 : 100) };
}
module.exports = { validate, STATUSES, SCOPES };
