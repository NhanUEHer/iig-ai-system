const syncService = require('../services/syncService');

module.exports = {
  async syncMappings(req, res) {
    try {
      const { pageSize, keyword, fromSubmittedDate, toSubmittedDate } = req.body;
      const count = await syncService.syncMappings({
        pageSize: Number.parseInt(pageSize, 10) || 100,
        keyword: keyword || null,
        fromSubmittedDate: fromSubmittedDate || null,
        toSubmittedDate: toSubmittedDate || null
      });
      return res.json({
        success: true,
        message: `Đồng bộ thành công ${count} keycode mapping từ hệ thống Elearning.`,
        count
      });
    } catch (error) {
      console.error('syncMappings Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  async syncSubmission(req, res) {
    const { keycode } = req.body;
    if (!keycode) {
      return res.status(400).json({ success: false, error: 'Keycode is required in request body.' });
    }
    try {
      const result = await syncService.syncSubmission(keycode);
      return res.json({
        success: true,
        message: `Successfully synchronized submission for keycode ${keycode.trim().toUpperCase()}`,
        data: result
      });
    } catch (error) {
      console.error(`syncSubmission (${keycode}) Error:`, error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
};

