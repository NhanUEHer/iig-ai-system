const bulkGradeService = require('../modules/scoring/bulkGradeService');
const gradingJobRepository = require('../modules/scoring/gradingJobRepository');
const HttpError = require('../http/httpError');

module.exports = {
  async create(req, res) {
    const job = await bulkGradeService.createJob({ submissionIds: req.body?.submissionIds, answerIds: req.body?.answerIds, userId: req.auth.userId });
    return res.status(202).json({ success: true, message: 'Đã đưa các câu cần chấm vào hàng đợi.', data: job });
  },
  async detail(req, res) {
    const job = await gradingJobRepository.findById(req.params.id, req.auth.userId, req.auth.role === 'admin');
    if (!job) throw new HttpError('Không tìm thấy job chấm điểm.', 404, 'JOB_NOT_FOUND');
    return res.json({ success: true, data: job });
  }
};
