const assert = require('node:assert/strict');
const test = require('node:test');

const { maskSecretPath } = require('../src/http/apiAccessLogger');
const { createSecureLecturePublicRoutes } = require('../src/routes/secureLecturePublicRoutes');
const { createShareService } = require('../src/modules/secure-lectures/services/shareService');
const {
  createContentService,
  CSP,
} = require('../src/modules/secure-lectures/services/contentService');
const { createMemoryBlobStore } = require('../src/modules/secure-lectures/stores/blobStore');
const { createMemoryTicketStore } = require('../src/modules/secure-lectures/stores/ticketStore');
const tokenService = require('../src/modules/secure-lectures/services/tokenService');

const DEVICE_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_DEVICE_ID = '00000000-0000-4000-8000-000000000002';
const SESSION_ID = '00000000-0000-4000-8000-000000000003';
const VERSION_ID = '00000000-0000-4000-8000-000000000004';
const SHARE_ID = '00000000-0000-4000-8000-000000000005';
const LECTURE_ID = '00000000-0000-4000-8000-000000000006';
const DEVICE_REF = '00000000-0000-4000-8000-000000000007';
const USER_ID = '00000000-0000-4000-8000-000000000008';
const NOW = new Date('2026-11-19T08:00:00.000Z');
const STORAGE_KEY = `${LECTURE_ID}/v1-test.html`;

async function contentFixture(source, { guardEnabled = true, watermarkEnabled = true } = {}) {
  const tickets = createMemoryTicketStore();
  const blobs = createMemoryBlobStore();
  const logs = [];
  await blobs.put(STORAGE_KEY, Buffer.from(source));
  const row = {
    version_id: VERSION_ID,
    storage_key: STORAGE_KEY,
    share_id: SHARE_ID,
    lecture_id: LECTURE_ID,
    recipient_name: 'Cô Lan',
    watermark_enabled: watermarkEnabled,
    guard_enabled: guardEnabled,
    device_ref: DEVICE_REF,
  };
  const repository = {
    async findDelivery(grant) {
      return grant.sessionId === SESSION_ID && grant.versionId === VERSION_ID
        && grant.deviceId === DEVICE_ID ? row : null;
    },
    async findPreview() { return row; },
    async logOpen(delivery, sessionId, context) { logs.push({ delivery, sessionId, context }); },
  };
  const content = createContentService({
    tickets,
    blobs,
    repository,
    now: () => new Date(NOW),
  });
  return { content, tickets, logs };
}

async function issue(tickets) {
  const ticket = tokenService.generate();
  await tickets.put(ticket, {
    sessionId: SESSION_ID,
    versionId: VERSION_ID,
    deviceId: DEVICE_ID,
  }, 60);
  return ticket;
}

async function requestContent(content, ticket, deviceId = DEVICE_ID) {
  const router = createSecureLecturePublicRoutes({
    content,
    limits: { async consume() { return { allowed: true, retryAfterSec: 0 }; } },
  });
  const handler = router.stack.find(layer => layer.route?.path === '/content/:ticket')
    .route.stack[0].handle;
  const result = { status: 200, headers: {}, body: undefined };
  const req = {
    params: { ticket },
    ip: '127.0.0.1',
    requestId: 'test-request',
    get(name) {
      if (String(name).toLowerCase() === 'cookie') return `sl_did=${deviceId}`;
      if (String(name).toLowerCase() === 'user-agent') return 'node-test';
      return undefined;
    },
  };
  const res = {
    status(code) { result.status = code; return this; },
    set(headers) {
      for (const [name, value] of Object.entries(headers)) {
        result.headers[name.toLowerCase()] = value;
      }
      return this;
    },
    send(body) { result.body = body; return this; },
  };
  await handler(req, res);
  return result;
}

test('content ticket is single-use and a reused ticket returns a blank 404', async () => {
  const { content, tickets, logs } = await contentFixture('<html><head></head><body>Slide</body></html>');
  const ticket = await issue(tickets);
  const first = await requestContent(content, ticket);
  assert.equal(first.status, 200);
  assert.match(first.body, /Slide/);

  const second = await requestContent(content, ticket);
  assert.equal(second.status, 404);
  assert.equal(second.body, '');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].sessionId, SESSION_ID);
});

test('content ticket with the wrong device cookie returns a blank 404', async () => {
  const { content, tickets } = await contentFixture('<html><body>Slide</body></html>');
  const ticket = await issue(tickets);
  const response = await requestContent(content, ticket, OTHER_DEVICE_ID);
  assert.equal(response.status, 404);
  assert.equal(response.body, '');
  assert.match(response.headers['cache-control'], /no-store/);
});

test('content injection adds guard and watermark before </head>', async () => {
  const { content, tickets } = await contentFixture('<html><head><title>Deck</title></head><body>Slide</body></html>');
  const html = await content.delivery(await issue(tickets), DEVICE_ID);
  assert.ok(html.indexOf('data-sl-guard') < html.indexOf('</head>'));
  assert.ok(html.indexOf('data-sl-watermark') < html.indexOf('</head>'));
  assert.match(html, /Cô Lan/);
  assert.match(html, /name="robots" content="noindex,nofollow"/);
});

test('content injection falls back to the beginning of body when head is absent', async () => {
  const { content, tickets } = await contentFixture('<html><body><main>Slide</main></body></html>');
  const html = await content.delivery(await issue(tickets), DEVICE_ID);
  const bodyStart = html.indexOf('<body>') + '<body>'.length;
  assert.ok(html.indexOf('data-sl-guard') >= bodyStart);
  assert.ok(html.indexOf('data-sl-guard') < html.indexOf('<main>'));
  assert.ok(html.indexOf('data-sl-watermark') < html.indexOf('<main>'));
});

test('guard_enabled=false omits the guard while retaining the watermark', async () => {
  const { content, tickets } = await contentFixture('<html><head></head><body>Slide</body></html>', {
    guardEnabled: false,
  });
  const html = await content.delivery(await issue(tickets), DEVICE_ID);
  assert.doesNotMatch(html, /data-sl-guard/);
  assert.match(html, /data-sl-watermark/);
});

test('content response is no-store and applies the opaque-origin CSP sandbox', async () => {
  const { content, tickets } = await contentFixture('<html><body>Slide</body></html>');
  const ticket = await issue(tickets);
  const response = await requestContent(content, ticket);
  assert.equal(response.status, 200);
  assert.match(response.headers['cache-control'], /no-store/);
  assert.match(response.headers['content-security-policy'], /frame-ancestors 'self'/);
  assert.match(response.headers['content-security-policy'], /connect-src 'none'/);
  assert.match(response.headers['content-security-policy'], /(?:^|; )sandbox allow-scripts allow-presentation(?:;|$)/);
  assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.match(CSP, /default-src 'none'/);
});

test('maskSecretPath hides viewer tokens and one-time content tickets', () => {
  const token = tokenService.generate();
  assert.equal(maskSecretPath(`/v/${token}`), '/v/***');
  assert.equal(maskSecretPath('/v/short-invalid-token'), '/v/***');
  assert.equal(
    maskSecretPath(`/api/public/lectures/content/${token}`),
    '/api/public/lectures/content/***',
  );
});

function memoryShareRepository() {
  return {
    async transaction(work) { return work({}); },
    async create(_client, input) {
      return {
        id: SHARE_ID,
        lecture_id: input.lectureId,
        pinned_version_id: null,
        token_hint: input.tokenHint,
        recipient_name: input.recipientName,
        recipient_email: null,
        valid_from: input.validFrom,
        expires_at: input.expiresAt,
        max_devices: input.maxDevices,
        max_concurrent: input.maxConcurrent,
        watermark_enabled: input.watermarkEnabled,
        guard_enabled: input.guardEnabled,
        created_at: NOW,
        updated_at: NOW,
      };
    },
    async log() {},
  };
}

test('share URL identifies request/config bases and the frontend resolves request bases', async () => {
  const input = { recipientName: 'Cô Lan', expiresAt: '2026-12-01T08:00:00.000Z' };
  const common = { repository: memoryShareRepository(), now: () => new Date(NOW) };
  const requestResult = await createShareService({ ...common, publicBaseUrl: '' })
    .create(LECTURE_ID, input, USER_ID, 'http://internal-api:5105');
  assert.equal(requestResult.baseUrlSource, 'request');
  assert.equal(requestResult.path, `/v/${requestResult.token}`);

  const configResult = await createShareService({ ...common, publicBaseUrl: 'https://admin.example/' })
    .create(LECTURE_ID, input, USER_ID, 'http://internal-api:5105');
  assert.equal(configResult.baseUrlSource, 'config');
  assert.equal(configResult.url, `https://admin.example/v/${configResult.token}`);

  const { resolveShareUrl } = await import('../frontend/src/services/secureLectureShareUrl.js');
  assert.equal(
    resolveShareUrl(requestResult, 'https://public.example/'),
    `https://public.example/v/${requestResult.token}`,
  );
  assert.equal(resolveShareUrl(configResult, 'https://wrong.example'), configResult.url);
});
