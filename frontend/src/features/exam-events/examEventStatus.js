export const EVENT_LIFECYCLE = Object.freeze({
  DRAFT: { value: 'DRAFT', label: 'Nháp', tone: 'draft' },
  UPCOMING: { value: 'UPCOMING', label: 'Chưa bắt đầu', tone: 'upcoming' },
  IN_PROGRESS: { value: 'IN_PROGRESS', label: 'Đang diễn ra', tone: 'in_progress' },
  COMPLETED: { value: 'COMPLETED', label: 'Đã kết thúc', tone: 'completed' },
  ARCHIVED: { value: 'ARCHIVED', label: 'Lưu trữ', tone: 'archived' }
});

export const EVENT_LIFECYCLE_OPTIONS = Object.values(EVENT_LIFECYCLE);
export const EVENT_CONFIGURATION_OPTIONS = [
  { value: 'DRAFT', label: 'Nháp', tone: 'draft' },
  { value: 'PUBLISHED', label: 'Vận hành theo lịch', tone: 'published' },
  { value: 'ARCHIVED', label: 'Lưu trữ', tone: 'archived' }
];

export function eventLifecycleMeta(value) {
  return EVENT_LIFECYCLE[value] || { value, label: value || '—', tone: 'completed' };
}

export function resolveEventLifecycle(status, startAt, endAt, now = Date.now()) {
  if (status === 'DRAFT') return EVENT_LIFECYCLE.DRAFT;
  if (status === 'ARCHIVED') return EVENT_LIFECYCLE.ARCHIVED;
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return EVENT_LIFECYCLE.UPCOMING;
  if (Number.isFinite(end) && end < now) return EVENT_LIFECYCLE.COMPLETED;
  if (Number.isFinite(start) && start > now) return EVENT_LIFECYCLE.UPCOMING;
  return EVENT_LIFECYCLE.IN_PROGRESS;
}
