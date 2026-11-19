const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('screenForError maps every public viewer error to its pure UI state', async () => {
  const { screenForError } = await import('../frontend/src/features/secure-lectures/viewer/viewerApi.js');
  const cases = {
    CONCURRENT_LIMIT: 'concurrent',
    SESSION_KICKED: 'kicked',
    DEVICE_LIMIT: 'deviceLimit',
    DEVICE_BLOCKED: 'deviceBlocked',
    DEVICE_REMOVED: 'deviceRemoved',
    LINK_EXPIRED: 'expired',
    LINK_REVOKED: 'revoked',
    LINK_NOT_STARTED: 'notStarted',
    RATE_LIMITED: 'rateLimited',
    NETWORK: 'network',
    LINK_INVALID: 'invalid',
  };
  for (const [code, expected] of Object.entries(cases)) {
    assert.equal(screenForError({ code }), expected, code);
  }
  assert.equal(screenForError({ code: 'UNKNOWN' }), 'invalid');
  assert.equal(screenForError(null), 'invalid');
});

test('DevTools suspicion is audit-only and cannot hide or lock lecture content', () => {
  const root = path.join(__dirname, '..');
  const viewer = fs.readFileSync(
    path.join(root, 'frontend/src/features/secure-lectures/viewer/ViewerPage.jsx'),
    'utf8',
  );
  const guard = fs.readFileSync(
    path.join(root, 'src/modules/secure-lectures/assets/guard.js'),
    'utf8',
  );
  assert.match(viewer, /reportEvent\(sessionRef\.current, 'devtools_suspected'\)/);
  assert.doesNotMatch(viewer, /sl:hide/);
  assert.doesNotMatch(guard, /sl:hide|sl-content-protection-overlay|Đã tạm ẩn nội dung/);
});
