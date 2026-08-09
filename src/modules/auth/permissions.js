const PERMISSION_GROUPS = [
  { key: 'submissions', label: 'Bài chấm', permissions: [
    ['submissions.view', 'Xem danh sách và chi tiết'], ['submissions.sync', 'Đồng bộ bài thi'],
    ['submissions.delete', 'Xóa bài thi'], ['submissions.export', 'Xuất dữ liệu']
  ] },
  { key: 'scoring', label: 'Xử lý bài chấm', permissions: [
    ['scoring.grade', 'Chấm điểm AI và ghi chú'], ['scoring.transcribe', 'Chuyển giọng nói thành văn bản'],
    ['scoring.clean_audio', 'Làm sạch âm thanh']
  ] },
  { key: 'mappings', label: 'Keycode', permissions: [
    ['mappings.view', 'Xem mapping'], ['mappings.manage', 'Tạo, sửa và xóa mapping'],
    ['mappings.schedule', 'Cấu hình lịch đồng bộ tự động']
  ] },
  { key: 'agents', label: 'AI Agents', permissions: [
    ['agents.view', 'Xem cấu hình Agent'], ['agents.manage', 'Tạo, sửa và xóa Agent']
  ] },
  { key: 'audio', label: 'Audio Studio', permissions: [
    ['audio.view', 'Xem Audio Studio'], ['audio.manage', 'Tạo và quản lý audio/voice']
  ] },
  { key: 'reports', label: 'Báo cáo', permissions: [
    ['reports.view', 'Xem báo cáo KPI'], ['reports.upload', 'Upload và đồng bộ báo cáo KPI'],
    ['reports.manage', 'Quản lý cấu hình và kỳ báo cáo']
  ] },
  { key: 'administration', label: 'Quản trị', permissions: [
    ['users.view', 'Xem tài khoản'], ['users.manage', 'Tạo, sửa và xóa tài khoản'],
    ['roles.view', 'Xem vai trò'], ['roles.manage', 'Tạo, sửa và phân quyền vai trò'],
    ['logs.view', 'Xem nhật ký hệ thống']
  ] }
];

const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(group => group.permissions.map(([key]) => key));
module.exports = { PERMISSION_GROUPS, ALL_PERMISSIONS };
