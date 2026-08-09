const mappingRepository = require('../modules/mappings/mappingRepository');
const syncScheduleRepository = require('../modules/mappings/syncScheduleRepository');

module.exports = {
  async list(req, res) {
    try {
      const result = await mappingRepository.listPage(req.query);
      return res.json({ success: true, data: result.rows, meta: result.meta });
    } catch (error) {
      console.error('List Mappings Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  async save(req, res) {
    const body = req.body || {};
    const keycode = req.params.keycode || body.keycode;
    const courseScoringId = body.courseScoringId || body.course_scoring_id;
    const studentName = body.studentName ?? body.student_name;
    const testName = body.testName ?? body.test_name;
    if (!keycode || !courseScoringId) {
      return res.status(400).json({ success: false, error: 'Keycode and Course Scoring ID are required.' });
    }

    const normalizedKeycode = keycode.trim().toUpperCase();
    try {
      const mapping = await mappingRepository.upsert({
        keycode: normalizedKeycode,
        courseScoringId: courseScoringId.trim(),
        studentName: studentName ? studentName.trim() : null,
        testName: testName ? testName.trim() : null
      });
      return res.json({
        success: true,
        message: `Successfully saved mapping for keycode ${normalizedKeycode}`,
        data: mapping
      });
    } catch (error) {
      console.error('Save Mapping Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  async remove(req, res) {
    const keycode = req.params.keycode.toUpperCase();
    try {
      if (!await mappingRepository.delete(keycode)) {
        return res.status(404).json({ success: false, error: 'Mapping not found.' });
      }
      return res.json({ success: true, message: `Successfully deleted mapping for keycode ${keycode}` });
    } catch (error) {
      console.error('Delete Mapping Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  async getSchedule(req, res) {
    return res.json({ success: true, data: await syncScheduleRepository.get() });
  },

  async updateSchedule(req, res) {
    const enabled = Boolean(req.body?.enabled);
    const runTime = String(req.body?.runTime || '').trim();
    const pageSize = Number.parseInt(req.body?.pageSize, 10);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(runTime)) {
      return res.status(400).json({ success: false, error: 'Thời gian đồng bộ phải có định dạng HH:mm.' });
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 5000) {
      return res.status(400).json({ success: false, error: 'Số lượng bản ghi phải từ 1 đến 5000.' });
    }
    const data = await syncScheduleRepository.update({ enabled, runTime, pageSize });
    return res.json({ success: true, message: 'Đã cập nhật lịch đồng bộ tự động.', data });
  }
};
