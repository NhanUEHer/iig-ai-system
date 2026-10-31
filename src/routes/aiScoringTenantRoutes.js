const express = require('express');
const asyncHandler = require('../http/asyncHandler');
const controller = require('../controllers/aiScoringTenantController');
const { requirePermission } = require('../middleware/authenticate');

const router = express.Router();
router.get('/', requirePermission('ai_scoring.tenants.view'), asyncHandler(controller.list));
router.post('/', requirePermission('ai_scoring.tenants.manage'), asyncHandler(controller.create));
router.get('/:tenantId', requirePermission('ai_scoring.tenants.view'), asyncHandler(controller.detail));
router.patch('/:tenantId', requirePermission('ai_scoring.tenants.manage'), asyncHandler(controller.update));
router.post('/:tenantId/activate', requirePermission('ai_scoring.tenants.manage'), asyncHandler(controller.activate));
router.post('/:tenantId/suspend', requirePermission('ai_scoring.tenants.manage'), asyncHandler(controller.suspend));
router.get('/:tenantId/audit-events', requirePermission('ai_scoring.audit.view'), asyncHandler(controller.audit));
module.exports = router;
