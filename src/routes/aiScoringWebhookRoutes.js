const express = require('express');
const asyncHandler = require('../http/asyncHandler');
const controller = require('../controllers/aiScoringWebhookController');
const { requirePermission } = require('../middleware/authenticate');

const router = express.Router();
router.get('/tenants/:tenantId/webhooks', requirePermission('ai_scoring.webhooks.view'), asyncHandler(controller.listEndpoints));
router.post('/tenants/:tenantId/webhooks', requirePermission('ai_scoring.webhooks.manage'), asyncHandler(controller.createEndpoint));
router.patch('/webhooks/:webhookId', requirePermission('ai_scoring.webhooks.manage'), asyncHandler(controller.updateEndpoint));
router.post('/webhooks/:webhookId/rotate-secret', requirePermission('ai_scoring.webhooks.manage'), asyncHandler(controller.rotateSecret));
router.post('/webhooks/:webhookId/test', requirePermission('ai_scoring.webhooks.manage'), asyncHandler(controller.testEndpoint));
router.get('/webhook-deliveries', requirePermission('ai_scoring.webhooks.view'), asyncHandler(controller.listDeliveries));
router.get('/webhook-deliveries/:deliveryId', requirePermission('ai_scoring.webhooks.view'), asyncHandler(controller.deliveryDetail));
router.post('/webhook-deliveries/:deliveryId/replay', requirePermission('ai_scoring.webhooks.replay'), asyncHandler(controller.replay));
module.exports = router;
