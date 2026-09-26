export const EXAM_STATUS = Object.freeze({
  DRAFT: { value: 'DRAFT', label: 'Bản nháp', tone: 'draft' },
  ACTIVE: { value: 'ACTIVE', label: 'Hoạt động', tone: 'active' },
  INACTIVE: { value: 'INACTIVE', label: 'Ngừng hoạt động', tone: 'inactive' }
});

export const EXAM_STATUS_OPTIONS = Object.values(EXAM_STATUS);
export const examStatusMeta = value => EXAM_STATUS[value] || { value, label: value || '—', tone: 'inactive' };
