const express = require('express');
const router = express.Router();
const localTtsController = require('../controllers/localTtsController');
const { requirePermission } = require('../middleware/authenticate');

router.get('/voices', requirePermission('audio.view'), localTtsController.getVoices);
router.get('/engine', requirePermission('audio.view'), localTtsController.getEngine);
router.post('/clone-voice', requirePermission('audio.manage'), localTtsController.cloneVoice);
router.post('/preview-cloned-voice', requirePermission('audio.manage'), localTtsController.previewClonedVoice);
router.post('/generate', requirePermission('audio.manage'), localTtsController.generateAudio);
router.get('/history', requirePermission('audio.view'), localTtsController.getHistory);
router.get('/history/:id', requirePermission('audio.view'), localTtsController.getHistoryDetail);
router.delete('/history/:id', requirePermission('audio.manage'), localTtsController.deleteHistory);
router.delete('/voices/:id', requirePermission('audio.manage'), localTtsController.deleteClonedVoice);

module.exports = router;
