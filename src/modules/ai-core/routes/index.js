const express = require('express');
const { requirePermission } = require('../../../middleware/authenticate');

const router = express.Router();

router.get('/health', requirePermission('ai_core.view'), (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(process.env.AI_CORE_MASTER_KEY?.trim()),
  });
});

module.exports = router;
