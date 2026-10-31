export const STATUS_LABEL = {
  ACCEPTED: 'Đã tiếp nhận', FETCHING_SOURCE: 'Đang lấy dữ liệu', SYNCING_EXAM: 'Đang đồng bộ đề',
  PREPARING_MEDIA: 'Chuẩn bị media', VALIDATING: 'Kiểm tra dữ liệu', READY_FOR_AI: 'Sẵn sàng chấm',
  QUEUED: 'Đang chờ', TRANSCRIBING: 'Chuyển giọng nói', EXTRACTING_FEATURES: 'Trích xuất đặc trưng',
  SCORING_QUESTIONS: 'Đang chấm câu', AGGREGATING_GROUPS: 'Tổng hợp nhóm', CALIBRATING: 'Hiệu chỉnh',
  COMPLETED: 'Hoàn tất', COMPLETED_WITH_ISSUES: 'Hoàn tất có lỗi', REVIEW_REQUIRED: 'Cần kiểm tra',
  FAILED: 'Thất bại', CANCELLED: 'Đã hủy', SCORED: 'Đã chấm', LLM_SCORING: 'Đang chấm AI',
  SKIPPED: 'Bỏ qua', WAITING: 'Đang chờ',
  ANSWER_STT: 'Nhận dạng câu trả lời', QUESTION_SCORING: 'Chấm điểm câu hỏi',
  GROUP_CALIBRATION: 'Hiệu chỉnh điểm nhóm', FEATURE_EXTRACTION: 'Trích xuất đặc trưng',
  AGGREGATING: 'Tổng hợp kết quả',
};

export const statusLabel = status => STATUS_LABEL[status] || status || 'Chưa xác định';

export const statusTone = status => status === 'COMPLETED' || status === 'SCORED' ? 'completed'
  : String(status).includes('FAILED') ? 'failed'
    : String(status).includes('REVIEW') || status === 'COMPLETED_WITH_ISSUES' || status === 'CANCELLED' ? 'warning'
      : ['QUEUED', 'ACCEPTED', 'WAITING'].includes(status) ? 'queued' : 'processing';
