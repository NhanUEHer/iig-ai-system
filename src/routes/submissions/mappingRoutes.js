const express = require('express');
const mappingController = require('../../controllers/mappingController');
const { requirePermission } = require('../../middleware/authenticate');

const router = express.Router();

router.get('/mappings', requirePermission('mappings.view'), mappingController.list);
router.post('/mappings', requirePermission('mappings.manage'), mappingController.save);
router.put('/mappings/:keycode', requirePermission('mappings.manage'), mappingController.save);
router.delete('/mappings/:keycode', requirePermission('mappings.manage'), mappingController.remove);
router.get('/mapping-sync-schedule', requirePermission('mappings.view'), mappingController.getSchedule);
router.put('/mapping-sync-schedule', requirePermission('mappings.schedule'), mappingController.updateSchedule);

module.exports = router;
