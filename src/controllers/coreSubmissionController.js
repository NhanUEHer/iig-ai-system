const submissionRepository = require('../modules/submissions/submissionRepository');
const tokenManager = require('../services/tokenManager');
const iigClient = require('../clients/iigClient');
const storageService = require('../services/storageService');

async function withPlaybackUrl(answer) {
  if (!storageService.isR2Key(answer?.cleaned_audio_url)) return answer;
  try {
    return { ...answer, cleaned_audio_url: await storageService.getSignedAudioUrl(answer.cleaned_audio_url) };
  } catch (error) {
    console.warn(`Unable to sign cleaned audio for answer ${answer.id}: ${error.message}`);
    return { ...answer, cleaned_audio_url: null, cleaned_audio_unavailable: true };
  }
}

module.exports = {
  async list(req, res) {
    try {
      const result = await submissionRepository.listPage(req.query);
      return res.json({ success: true, count: result.rows.length, data: result.rows, meta: result.meta });
    } catch (error) {
      console.error('listSubmissions Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  async detail(req, res) {
    const { id } = req.params;
    try {
      const submission = await submissionRepository.findById(id);
      if (!submission) {
        return res.status(404).json({ success: false, error: 'Submission not found locally.' });
      }
      const answers = await Promise.all((await submissionRepository.findAnswersWithEvaluation(id)).map(withPlaybackUrl));
      return res.json({ success: true, data: { ...submission, answers } });
    } catch (error) {
      console.error(`getSubmissionDetail (${id}) Error:`, error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  async answers(req, res) {
    const submission = await submissionRepository.findById(req.params.id);
    if (!submission) return res.status(404).json({ success: false, error: 'Không tìm thấy bài thi.' });
    const answers = await Promise.all((await submissionRepository.findAnswersWithEvaluation(req.params.id)).map(withPlaybackUrl));
    const counts = answers.reduce((summary, answer) => {
      summary.total += 1;
      summary[answer.status] = (summary[answer.status] || 0) + 1;
      return summary;
    }, { total: 0, pending: 0, scoring: 0, scored: 0, error: 0 });
    return res.json({ success: true, data: answers, meta: { counts } });
  },

  async answerDetail(req, res) {
    const answer = await submissionRepository.findAnswerDetail(req.params.id, req.params.answerId);
    if (!answer) return res.status(404).json({ success: false, error: 'Không tìm thấy câu trả lời trong bài thi.' });
    return res.json({ success: true, data: await withPlaybackUrl(answer) });
  },

  async fileUrl(req, res) {
    try {
      const token = await tokenManager.ensureFreshToken();
      const url = await iigClient.getMigratedFileUrl(req.params.fileId, token);
      return res.json({ success: true, url });
    } catch (error) {
      console.error(`getFileUrl (${req.params.fileId}) Error:`, error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  async remove(req, res) {
    try {
      const submission = await submissionRepository.findById(req.params.id, { includeDeleted: true });
      if (!submission) return res.status(404).json({ success: false, error: 'Bài làm không tồn tại.' });
      if (Number.parseInt(submission.status, 10) !== 1) {
        return res.status(400).json({
          success: false,
          error: `Không thể xóa bài làm của keycode ${submission.keycode} vì bài thi đã được chấm điểm trên Elearning.`
        });
      }
      await submissionRepository.softDelete(req.params.id);
      return res.json({
        success: true,
        message: `Đã xóa bài làm của keycode ${submission.keycode} thành công khỏi hệ thống.`
      });
    } catch (error) {
      console.error('Delete Submission Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  async bulkRemove(req, res) {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Danh sách ID bài làm cần xóa không hợp lệ.' });
    }
    try {
      const rows = await submissionRepository.findDeletionCandidates(ids);
      const pendingIds = rows.filter(row => Number.parseInt(row.status, 10) === 1).map(row => row.id);
      const skippedCount = rows.length - pendingIds.length;
      if (pendingIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: `Không có bài làm nào chưa chấm được tìm thấy trong danh sách đã chọn. (${skippedCount} bài đã được chấm điểm không thể xóa).`
        });
      }
      await submissionRepository.softDelete(pendingIds);
      const suffix = skippedCount > 0 ? ` Bỏ qua ${skippedCount} bài làm đã được chấm điểm.` : '';
      return res.json({
        success: true,
        message: `Đã xóa thành công ${pendingIds.length} bài làm chưa chấm khỏi hệ thống.${suffix}`,
        deletedCount: pendingIds.length,
        skippedCount
      });
    } catch (error) {
      console.error('Bulk Delete Submissions Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
};
