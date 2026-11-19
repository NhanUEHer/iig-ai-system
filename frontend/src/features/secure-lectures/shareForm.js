const DAY_MS = 24 * 60 * 60 * 1000;

export function formatShareStatus(share, now = new Date()) {
  if (share?.status === 'revoked' || share?.revokedAt) return { label: 'Đã thu hồi', tone: 'danger' };
  if (share?.status === 'expired' || new Date(share?.expiresAt) <= now) return { label: 'Hết hạn', tone: 'muted' };
  if (share?.status === 'scheduled' || new Date(share?.validFrom) > now) return { label: 'Chưa bắt đầu', tone: 'info' };
  const days = Math.max(1, Math.ceil((new Date(share?.expiresAt).getTime() - now.getTime()) / DAY_MS));
  if (share?.expiring || days <= 3) return { label: `Còn ${days} ngày`, tone: 'warning' };
  return { label: 'Hoạt động', tone: 'success' };
}

export function validateShareForm(form, now = new Date()) {
  const errors = {};
  const validFrom = new Date(form.validFrom);
  const expiresAt = new Date(form.expiresAt);
  const maxDevices = Number(form.maxDevices);
  const maxConcurrent = Number(form.maxConcurrent);
  if (!String(form.recipientName || '').trim()) errors.recipientName = 'Nhập tên người nhận.';
  if (Number.isNaN(validFrom.getTime())) errors.validFrom = 'Chọn thời điểm bắt đầu.';
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) errors.expiresAt = 'Hạn dùng phải ở tương lai.';
  else if (!Number.isNaN(validFrom.getTime()) && expiresAt <= validFrom) errors.expiresAt = 'Hạn dùng phải sau thời điểm bắt đầu.';
  else if (!Number.isNaN(validFrom.getTime()) && expiresAt - validFrom > 365 * DAY_MS) errors.expiresAt = 'Thời hạn tối đa là 365 ngày.';
  if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 20) errors.maxDevices = 'Số thiết bị phải từ 1 đến 20.';
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > maxDevices) errors.maxConcurrent = 'Số mở cùng lúc phải từ 1 đến số thiết bị.';
  return errors;
}

export function toDateTimeLocal(value) {
  const date = value ? new Date(value) : new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function createShareDefaults(now = new Date()) {
  return {
    recipientName: '', recipientEmail: '', validFrom: toDateTimeLocal(now),
    expiresAt: toDateTimeLocal(new Date(now.getTime() + 30 * DAY_MS)),
    maxDevices: 3, maxConcurrent: 1, pinnedVersionId: '',
    watermarkEnabled: true, guardEnabled: true,
  };
}
