const express = require('express');
const asyncHandler = require('../http/asyncHandler');
const controller = require('../controllers/aiScoringCredentialController');
const { requirePermission } = require('../middleware/authenticate');

const router = express.Router();
router.get('/tenants/:tenantId/credentials', requirePermission('ai_scoring.credentials.view'), asyncHandler(controller.list));
router.post('/tenants/:tenantId/credentials', requirePermission('ai_scoring.credentials.manage'), asyncHandler(controller.create));
router.patch('/credentials/:credentialId', requirePermission('ai_scoring.credentials.manage'), asyncHandler(controller.update));
router.post('/credentials/:credentialId/rotate', requirePermission('ai_scoring.credentials.manage'), asyncHandler(controller.rotate));
router.post('/credentials/:credentialId/revoke', requirePermission('ai_scoring.credentials.manage'), asyncHandler(controller.revoke));
module.exports = router;
