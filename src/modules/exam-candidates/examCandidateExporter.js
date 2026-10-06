const XLSX = require('xlsx');
const service = require('./examCandidateService');

const fmt = value => value ? new Date(value).toLocaleString('vi-VN', { hour12: false }) : '';
const scoreRange = activity => activity.scoreRangeMin == null
  ? ''
  : `${activity.scoreRangeMin} – ${activity.scoreRangeMax ?? activity.scoreRangeMin}`;

async function create(filters) {
  const result = await service.list({ ...filters, page: 1, limit: 10000, __export: true });
  const rows = result.data.map((row, index) => ({
    STT: index + 1,
    SBD: row.candidate.candidateNumber,
    'Họ và tên': row.candidate.fullName,
    'Số điện thoại': row.candidate.phone,
    Email: row.candidate.email,
    'Trường / Đơn vị': row.candidate.schoolName,
    'Năm sinh': row.candidate.birthYear ?? '',
    'Tình trạng học TOEIC': service.TOEIC_LABELS[row.candidate.toeicExperience] || '',
    'Mã đề': row.exam?.code || '',
    'Đề thi': row.exam?.title || '',
    'Trạng thái': service.STATUS_LABELS[row.activity.status] || row.activity.status,
    'Bắt đầu làm bài': fmt(row.activity.startedAt),
    'Nộp bài': fmt(row.activity.submittedAt),
    'Số câu đúng': row.activity.correctCount ?? '',
    'Số câu sai': row.activity.incorrectCount ?? '',
    'Điểm': row.activity.totalScore ?? '',
    'Dãy điểm': scoreRange(row.activity),
  }));
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 6 }, { wch: 20 }, { wch: 28 }, { wch: 16 }, { wch: 30 }, { wch: 28 },
    { wch: 10 }, { wch: 26 }, { wch: 18 }, { wch: 36 }, { wch: 18 }, { wch: 22 },
    { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, 'Hoạt động thí sinh');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { create };
