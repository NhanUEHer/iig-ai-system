const express = require('express');
const syncController = require('../../controllers/syncController');
const { requirePermission } = require('../../middleware/authenticate');

const router = express.Router();

router.post('/sync-mappings', requirePermission('submissions.sync'), syncController.syncMappings);
router.post('/sync', requirePermission('submissions.sync'), syncController.syncSubmission);

module.exports = router;
