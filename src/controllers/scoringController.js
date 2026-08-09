const cleanAnswerAudio = require('../modules/scoring/cleanAnswerAudio');
const gradeAnswer = require('../modules/scoring/gradeAnswer');
const saveTeacherNote = require('../modules/scoring/saveTeacherNote');
const transcribeAnswer = require('../modules/scoring/transcribeAnswer');
const { cleanAnswersAudio } = require('../modules/scoring/cleanAnswerAudio');

module.exports = {
  async gradeAnswer(req, res) {
    const data = await gradeAnswer({
      answerId: req.body.answerId,
      agentId: req.body.agentId,
      publicUrl: process.env.PUBLIC_URL || null
    });
    return res.json({ success: true, message: 'Chấm điểm AI hoàn tất thành công.', data });
  },
  async transcribeAnswer(req, res) {
    const data = await transcribeAnswer({
      answerId: req.body.answerId,
      agentId: req.body.agentId,
      targetType: req.body.targetType,
      publicUrl: process.env.PUBLIC_URL || null
    });
    return res.json({ success: true, message: 'Dịch giọng nói (STT) hoàn tất.', data });
  },

  async cleanAudio(req, res) {
    const data = await cleanAnswerAudio({
      answerId: req.body.answerId,
      method: req.body.method,
      publicOrigin: `${req.protocol}://${req.get('host')}`
    });
    return res.json({ success: true, message: 'Làm sạch âm thanh thành công.', data });
  },

  async bulkCleanAudio(req, res) {
    const data = await cleanAnswersAudio({
      answerIds: req.body.answerIds,
      method: req.body.method,
      publicOrigin: `${req.protocol}://${req.get('host')}`
    });
    return res.json({ success: true, message: `Đã làm sạch ${data.success}/${data.total} tệp audio.`, data });
  },

  async teacherNote(req, res) {
    await saveTeacherNote({
      answerId: req.body.answer_id,
      teacherNote: req.body.teacher_note
    });
    return res.json({ success: true, message: 'Nhận xét giáo viên đã được lưu.' });
  }
};
