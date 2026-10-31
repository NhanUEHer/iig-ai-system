const express = require('express');
const asyncHandler = require('../http/asyncHandler');
const controller = require('../controllers/iigIntegrationController');
const {
  createIigIntegrationAuth,
  createIigIntegrationRateLimit,
  requireIntegrationScope,
} = require('../middleware/iigIntegrationAuth');

const router = express.Router();

router.use(createIigIntegrationAuth());
router.use(createIigIntegrationRateLimit());
router.post('/scoring-jobs', requireIntegrationScope('jobs:create'), asyncHandler(controller.createScoringJob));
router.get('/scoring-jobs/:jobId', requireIntegrationScope('jobs:read'), asyncHandler(controller.getScoringJob));
router.post('/scoring-jobs/:jobId/retry', requireIntegrationScope('jobs:retry'), asyncHandler(controller.retryScoringJob));

module.exports = router;
