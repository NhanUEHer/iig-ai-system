import assert from 'node:assert/strict';
import test from 'node:test';
import { formatShareStatus, validateShareForm } from './shareForm.js';

const now = new Date('2026-11-19T00:00:00.000Z');

test('formatShareStatus prioritizes revoked and reports expiring links', () => {
  assert.deepEqual(formatShareStatus({ status: 'revoked' }, now), { label: 'Đã thu hồi', tone: 'danger' });
  assert.deepEqual(formatShareStatus({ status: 'active', expiresAt: '2026-11-21T00:00:00.000Z' }, now), { label: 'Còn 2 ngày', tone: 'warning' });
});

test('validateShareForm enforces recipient, dates and concurrency', () => {
  const errors = validateShareForm({
    recipientName: '', validFrom: '2026-11-19T01:00:00.000Z',
    expiresAt: '2026-11-20T01:00:00.000Z', maxDevices: 2, maxConcurrent: 3,
  }, now);
  assert.equal(errors.recipientName, 'Nhập tên người nhận.');
  assert.equal(errors.maxConcurrent, 'Số mở cùng lúc phải từ 1 đến số thiết bị.');
});

test('validateShareForm accepts a valid share', () => {
  assert.deepEqual(validateShareForm({
    recipientName: 'Cô Lan', validFrom: '2026-11-19T01:00:00.000Z',
    expiresAt: '2026-12-19T01:00:00.000Z', maxDevices: 3, maxConcurrent: 1,
  }, now), {});
});
