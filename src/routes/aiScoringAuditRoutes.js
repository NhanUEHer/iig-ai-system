const express = require('express');
const asyncHandler = require('../http/asyncHandler');
const controller = require('../controllers/aiScoringAuditController');
const { requirePermission } = require('../middleware/authenticate');
const router = express.Router();
router.get('/audit-events', requirePermission('ai_scoring.audit.view'), asyncHandler(controller.list));
router.get('/audit-events/:eventId', requirePermission('ai_scoring.audit.view'), asyncHandler(controller.detail));
module.exports = router;
