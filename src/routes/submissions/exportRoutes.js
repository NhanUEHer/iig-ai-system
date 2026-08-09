const express = require('express');
const exportController = require('../../controllers/exportController');
const { requirePermission } = require('../../middleware/authenticate');

const router = express.Router();

router.post('/export', requirePermission('submissions.export'), exportController.exportSubmissions);

module.exports = router;
