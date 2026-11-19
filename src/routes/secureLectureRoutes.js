const express = require('express');
const { requirePermission } = require('../middleware/authenticate');

const router = express.Router();

router.get('/health', requirePermission('secure_lectures.view'), (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
