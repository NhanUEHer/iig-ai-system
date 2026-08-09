const XLSX = require('xlsx');
const exportRepository = require('../modules/exports/exportRepository');

function statusLabel(status) {
  return ({ 1: 'Chưa chấm', 2: 'Đang chấm', 3: 'Đã chấm', 4: 'Lỗi' })[status] || 'Không xác định';
}

function buildRows(rows) {
  const submissions = new Map();
  for (const row of rows) {
    if (!submissions.has(row.sub_id)) {
      submissions.set(row.sub_id, {
        ...row,
        scores: {}
      });
    }
    if (row.section && row.question_no && row.final_score !== null) {
      const number = Number.parseInt(row.question_no, 10);
      const key = row.section === 'Speaking' ? number : number + 11;
      submissions.get(row.sub_id).scores[key] = Math.round(Number.parseFloat(row.final_score));
    }
  }

  const headers = ['Keycode', 'Tên đề', 'ngày nộp', 'đồng bộ', 'trạng thái',
    ...Array.from({ length: 19 }, (_, index) => `Q${index + 1}`)];
  const output = [headers];
  for (const submission of submissions.values()) {
    output.push([
      submission.keycode || '',
      submission.test_name || '',
      submission.submitted_date ? new Date(submission.submitted_date).toLocaleString('vi-VN') : '',
      submission.synced_at ? new Date(submission.synced_at).toLocaleString('vi-VN') : '',
      statusLabel(submission.status),
      ...Array.from({ length: 19 }, (_, index) => submission.scores[index + 1] ?? '')
    ]);
  }
  return output;
}

module.exports = {
  async exportSubmissions(req, res) {
    const { submissionIds } = req.body;
    if (!Array.isArray(submissionIds) || submissionIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'submissionIds is required and must be a non-empty array.'
      });
    }
    try {
      const rows = await exportRepository.findSubmissionScores(submissionIds);
      const worksheet = XLSX.utils.aoa_to_sheet(buildRows(rows));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Submissions');
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="export_data_submissions.xlsx"');
      return res.status(200).send(buffer);
    } catch (error) {
      console.error('exportSubmissions error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
};

module.exports.buildRows = buildRows;
