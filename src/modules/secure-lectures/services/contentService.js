const fs = require('node:fs');
const path = require('node:path');

const tokenService = require('./tokenService');
const { createContentRepository } = require('../repositories/contentRepository');
const { createBlobStore } = require('../stores/blobStore');
const { ticketStore } = require('../stores/runtimeStores');

const ASSET_ROOT = path.join(__dirname, '../assets');
const GUARD_SOURCE = fs.readFileSync(path.join(ASSET_ROOT, 'guard.js'), 'utf8');
const WATERMARK_SOURCE = fs.readFileSync(path.join(ASSET_ROOT, 'watermark.js'), 'utf8');
const CSP = [
  "sandbox allow-scripts allow-presentation",
  "frame-ancestors 'self'",
  "default-src 'none'",
  "script-src 'unsafe-inline' blob:",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

class ContentNotFoundError extends Error {
  constructor() {
    super('Secure lecture content is unavailable.');
    this.name = 'ContentNotFoundError';
  }
}

function safeInlineJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function watermarkText(recipientName, now) {
  const formatted = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now).replace(',', '');
  return `${recipientName} · ${formatted}`;
}

function injection({ guardEnabled, watermark }) {
  const chunks = ['<meta name="robots" content="noindex,nofollow">'];
  if (guardEnabled) chunks.push(`<script data-sl-guard>\n${GUARD_SOURCE}\n</script>`);
  if (watermark) {
    chunks.push(`<script>window.__SL_WATERMARK__=${safeInlineJson({ text: watermark })};</script>`);
    chunks.push(`<script data-sl-watermark>\n${WATERMARK_SOURCE}\n</script>`);
  }
  return chunks.join('\n');
}

function injectHtml(source, options) {
  const html = Buffer.isBuffer(source) ? source.toString('utf8') : String(source || '');
  const payload = injection(options);
  const headClose = /<\/head\s*>/i.exec(html);
  if (headClose) return `${html.slice(0, headClose.index)}${payload}\n${html.slice(headClose.index)}`;
  const bodyOpen = /<body(?:\s[^>]*)?>/i.exec(html);
  if (bodyOpen) {
    const index = bodyOpen.index + bodyOpen[0].length;
    return `${html.slice(0, index)}\n${payload}${html.slice(index)}`;
  }
  return `${payload}\n${html}`;
}

function setContentHeaders(res) {
  res.set({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, private, max-age=0',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': CSP,
    'Content-Disposition': 'inline',
  });
}

function createContentService({
  tickets = ticketStore,
  repository = createContentRepository(),
  blobs = createBlobStore(),
  now = () => new Date(),
} = {}) {
  async function delivery(ticket, deviceId, context = {}) {
    if (!tokenService.isWellFormed(ticket)) throw new ContentNotFoundError();
    const grant = await tickets.consume(ticket);
    if (!grant || String(grant.deviceId) !== String(deviceId || '')) {
      throw new ContentNotFoundError();
    }
    const row = await repository.findDelivery(grant);
    if (!row) throw new ContentNotFoundError();
    const buffer = await blobs.get(row.storage_key);
    const html = injectHtml(buffer, {
      guardEnabled: row.guard_enabled === true,
      watermark: row.watermark_enabled === true
        ? watermarkText(row.recipient_name, now()) : null,
    });
    await repository.logOpen(row, grant.sessionId, context);
    return html;
  }

  async function preview(lectureId, versionId, adminName) {
    const row = await repository.findPreview(lectureId, versionId);
    if (!row) throw new ContentNotFoundError();
    return injectHtml(await blobs.get(row.storage_key), {
      guardEnabled: true,
      watermark: watermarkText(`XEM TRƯỚC · ${String(adminName || 'Quản trị viên')}`, now()),
    });
  }

  return {
    delivery,
    preview,
    injectHtml,
    setContentHeaders,
    ContentNotFoundError,
  };
}

const service = createContentService();
module.exports = {
  ...service,
  createContentService,
  ContentNotFoundError,
  injectHtml,
  setContentHeaders,
  CSP,
};
