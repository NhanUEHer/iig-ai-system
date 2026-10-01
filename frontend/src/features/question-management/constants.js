export const QUESTION_TYPES = [
  { value: 'MCQ_SINGLE', label: 'Dạng 1: MCQ' },
  { value: 'RECORD', label: 'Dạng 2: Record' },
  { value: 'WRITING', label: 'Dạng 3: Writing' },
];

export const QUESTION_STATUSES = [
  { value: 'ACTIVE', label: 'Hoạt động' },
  { value: 'INACTIVE', label: 'Dừng hoạt động' },
  { value: 'DRAFT', label: 'Bản nháp' },
];

export const statusLabel = value => QUESTION_STATUSES.find(item => item.value === value)?.label || value;
export const typeLabel = value => QUESTION_TYPES.find(item => item.value === value)?.label || value;
export const clientId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const apiError = (error, fallback) => error.response?.data?.error || error.response?.data?.message || fallback;
