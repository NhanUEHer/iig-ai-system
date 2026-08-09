const assert = require('node:assert/strict');
const test = require('node:test');
const { buildPasswordActionEmail } = require('../src/services/emailTemplates/passwordActionEmail');

test('password reset email contains branding, expiry and HTTPS action URL', () => {
  const url = 'https://admin.iigvn.site/reset-password?token=secret';
  const message = buildPasswordActionEmail({ name: 'Nguyễn An', actionUrl: url, purpose: 'reset' });
  assert.match(message.subject, /Khôi phục mật khẩu/);
  assert.match(message.html, /IIG Admin/);
  assert.match(message.html, /60 phút/);
  assert.ok(message.text.includes(url));
});

test('setup email uses activation copy and escapes untrusted values', () => {
  const message = buildPasswordActionEmail({ name: '<script>alert(1)</script>', actionUrl: 'https://admin.iigvn.site/setup-password?token=a&next=b', purpose: 'setup' });
  assert.match(message.subject, /Thiết lập tài khoản/);
  assert.doesNotMatch(message.html, /<script>alert/);
  assert.match(message.html, /&amp;next=b/);
});
