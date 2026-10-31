export const TENANT_SCOPE_OPTIONS = [
  { value: 'jobs:create', label: 'Tạo scoring job' },
  { value: 'jobs:read', label: 'Đọc trạng thái job' },
  { value: 'results:read', label: 'Đọc kết quả chấm' },
  { value: 'jobs:retry', label: 'Gửi lại job lỗi' },
];

export const scopeLabel = value => TENANT_SCOPE_OPTIONS.find(option => option.value === value)?.label || value;
