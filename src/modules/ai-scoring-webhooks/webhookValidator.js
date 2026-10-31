const dns = require('node:dns').promises;
const net = require('node:net');
const HttpError = require('../../http/httpError');

const EVENT_TYPES = ['scoring.completed', 'scoring.failed'];

function validationError(message, field) {
  throw new HttpError(message, 422, 'WEBHOOK_VALIDATION_FAILED', { field });
}

function isPrivateAddress(address) {
  if (!net.isIP(address)) return true;
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const normalized = address.toLowerCase();
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') ||
    normalized.startsWith('fd') || normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb') ||
    normalized.startsWith('::ffff:127.') || normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.');
}

async function resolveSafeUrl(value, resolver = dns) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { validationError('URL webhook không hợp lệ.', 'url'); }
  if (url.protocol !== 'https:') validationError('Webhook chỉ chấp nhận URL HTTPS.', 'url');
  if (url.username || url.password) validationError('URL webhook không được chứa thông tin đăng nhập.', 'url');
  if (url.port && url.port !== '443') validationError('Webhook chỉ được sử dụng cổng HTTPS 443.', 'url');
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    validationError('Webhook không được trỏ tới địa chỉ nội bộ.', 'url');
  }
  let addresses;
  try {
    addresses = net.isIP(hostname) ? [{ address: hostname, family: net.isIPv4(hostname) ? 4 : 6 }] : await resolver.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new HttpError('Không thể phân giải hostname webhook.', 422, 'WEBHOOK_DNS_FAILED', { field: 'url' });
  }
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) {
    validationError('Webhook không được trỏ tới IP private, loopback hoặc link-local.', 'url');
  }
  return { url, addresses };
}

function normalizeEvents(events) {
  if (!Array.isArray(events)) validationError('Chọn ít nhất một loại sự kiện.', 'eventTypes');
  const normalized = [...new Set(events.map(value => String(value).trim()))];
  if (!normalized.length || normalized.some(value => !EVENT_TYPES.includes(value))) {
    validationError('Loại sự kiện webhook không hợp lệ.', 'eventTypes');
  }
  return normalized;
}

async function endpointInput(body = {}, { partial = false, resolver } = {}) {
  const name = String(body.name || '').trim();
  if (!partial || body.name !== undefined) {
    if (name.length < 2 || name.length > 120) validationError('Tên webhook phải từ 2 đến 120 ký tự.', 'name');
  }
  let url;
  if (!partial || body.url !== undefined) url = (await resolveSafeUrl(body.url, resolver)).url.toString();
  let eventTypes;
  if (!partial || body.eventTypes !== undefined) eventTypes = normalizeEvents(body.eventTypes);
  const status = body.status === undefined ? undefined : String(body.status).toUpperCase();
  if (status !== undefined && !['ACTIVE', 'DISABLED'].includes(status)) validationError('Trạng thái webhook không hợp lệ.', 'status');
  return { ...(name ? { name } : {}), ...(url ? { url } : {}), ...(eventTypes ? { eventTypes } : {}), ...(status ? { status } : {}) };
}

module.exports = { EVENT_TYPES, isPrivateAddress, resolveSafeUrl, normalizeEvents, endpointInput };
