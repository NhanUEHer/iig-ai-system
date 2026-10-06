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
  { key: 'key_vocab', label: 'Gen Key Vocab', permissions: [
    ['key_vocab.view', 'Xem lịch sử Key Vocab'], ['key_vocab.generate', 'Tạo Key Vocab bằng AI'],
    ['key_vocab.manage', 'Chỉnh sửa và lưu Key Vocab']
  ] },
  { key: 'dictionary', label: 'Gen Dictionary', permissions: [
    ['dictionary.view', 'Xem lịch sử Dictionary'], ['dictionary.generate', 'Tạo Dictionary bằng AI'],
    ['dictionary.manage', 'Chỉnh sửa và lưu Dictionary']
  ] },
  { key: 'content_sources', label: 'Nguồn học liệu', permissions: [
    ['content_sources.view', 'Xem nguồn đã thu thập'], ['content_sources.create', 'Tải lên và nhận diện nguồn'],
    ['content_sources.analyze', 'Phân tích nguồn bằng AI']
  ] },
  { key: 'reports', label: 'Báo cáo', permissions: [
    ['reports.view', 'Xem dashboard báo cáo KPI'],
    ['reports.forms.view', 'Chỉ xem danh sách kỳ và phiếu chi tiết'],
    ['reports.entry', 'Nhập dữ liệu phiếu được phân công'],
    ['reports.review', 'Xem, trả lại và duyệt phiếu báo cáo'],
    ['reports.publish', 'Publish và thu hồi kỳ báo cáo'],
    ['reports.assign', 'Phân công người thực hiện phiếu'],
    ['reports.manage', 'Tạo, xóa kỳ và quản lý cấu hình KPI'],
    ['reports.upload', 'Đồng bộ báo cáo Excel cũ (legacy)']
  ] },
  { key: 'expenses', label: 'Quản lý chi phí', permissions: [
    ['expenses.view','Xem sao kê và giao dịch'],['expenses.import','Import và xác nhận sao kê'],
    ['expenses.classify','Phân loại giao dịch'],['expenses.reconcile','Đối soát giao dịch'],
    ['expenses.review','Duyệt ngoại lệ'],['expenses.config','Cấu hình tài khoản ngân hàng'],
    ['expenses.manage','Quản trị toàn bộ chi phí']
  ] },
  { key: 'question_bank', label: 'Ngân hàng câu hỏi', permissions: [
    ['question_bank.view', 'Xem danh sách và chi tiết câu hỏi'],
    ['question_bank.manage', 'Tạo, sửa và xóa câu hỏi'],
    ['question_bank.media_manage', 'Tải lên, thay thế và xóa media câu hỏi'],
    ['question_bank.taxonomy_manage', 'Tạo, sửa và xóa nhóm câu hỏi']
  ] },
  { key: 'exams', label: 'Quản lý đề thi', permissions: [
    ['exams.view', 'Xem danh sách và chi tiết đề thi'],
    ['exams.manage', 'Tạo, sửa, xóa đề thi, phần thi và câu hỏi']
  ] },
  { key: 'exam_candidates', label: 'Quản lý thí sinh', permissions: [
    ['exam_candidates.view', 'Xem hồ sơ và hoạt động làm bài của thí sinh'],
    ['exam_candidates.export', 'Xuất dữ liệu hoạt động thí sinh']
  ] },
  { key: 'administration', label: 'Quản trị', permissions: [
    ['users.view', 'Xem tài khoản'], ['users.manage', 'Tạo, sửa và xóa tài khoản'],
    ['roles.view', 'Xem vai trò'], ['roles.manage', 'Tạo, sửa và phân quyền vai trò'],
    ['logs.view', 'Xem nhật ký hệ thống']
  ] }
];

const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(group => group.permissions.map(([key]) => key));
module.exports = { PERMISSION_GROUPS, ALL_PERMISSIONS };
