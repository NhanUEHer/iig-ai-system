const path = require('node:path');
const { TextDecoder } = require('node:util');

const config = require('../config');
const { SecureLectureError } = require('../errors');

function invalid(message) {
  throw new SecureLectureError('FILE_INVALID', message);
}

function inspectHtml(file, { maxUploadMb = config.maxUploadMb } = {}) {
  if (!file || !Buffer.isBuffer(file.buffer)) invalid('Vui lòng chọn file HTML.');

  const filename = String(file.originalname || file.filename || '');
  if (!['.html', '.htm'].includes(path.extname(filename).toLowerCase())) {
    invalid('Chỉ hỗ trợ file .html hoặc .htm.');
  }

  const maxBytes = Math.floor(Number(maxUploadMb) * 1024 * 1024);
  if (file.buffer.length > maxBytes) {
    throw new SecureLectureError(
      'FILE_TOO_LARGE',
      `File vượt quá dung lượng tối đa ${maxUploadMb} MB.`,
    );
  }

  const mime = String(file.mimetype || '').split(';', 1)[0].trim().toLowerCase();
  if (mime && mime !== 'text/html') invalid('Kiểu nội dung của file phải là text/html.');

  let html;
  try {
    html = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
  } catch (_error) {
    invalid('File phải dùng mã hóa UTF-8 hợp lệ.');
  }
  if (!/<(?:html|body)\b/i.test(html)) invalid('File không chứa tài liệu HTML hợp lệ.');

  const hosts = new Set();
  const urlPattern = /\b(?:src|href)\s*=\s*(?:["']([^"']+)["']|([^\s>]+))/gi;
  for (const match of html.matchAll(urlPattern)) {
    const raw = match[1] || match[2];
    if (!/^https?:\/\//i.test(raw)) continue;
    try {
      hosts.add(new URL(raw).hostname.toLowerCase());
    } catch (_error) {
      // A malformed external URL is ignored in metadata; the HTML remains immutable.
    }
  }

  const sectionCount = (html.match(/<section\b/gi) || []).length;
  const slideClassCount = (html.match(/<[^>]+\bclass\s*=\s*["'][^"']*\bslide\b[^"']*["']/gi) || []).length;
  return {
    html,
    meta: {
      slideCountGuess: Math.max(sectionCount, slideClassCount, 1),
      externalHosts: [...hosts].sort(),
      hasAudio: /<audio\b|data:audio\//i.test(html),
    },
  };
}

module.exports = { inspectHtml };
