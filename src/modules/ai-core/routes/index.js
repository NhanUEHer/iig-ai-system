const express = require('express');
const { requirePermission } = require('../../../middleware/authenticate');
const connections = require('./connections');
const models = require('./models');
const logs = require('./logs');
const usage = require('./usage');
const agents = require('./agents');
const { AiCoreError } = require('../errors');

const router = express.Router();

// Providers come from the registry, so the UI never hardcodes them.
router.get('/providers', requirePermission('ai_core.view', 'ai_core.manage'), (_req, res) => {
  res.json({ data: require('../providers').list() });
});

router.get('/health', requirePermission('ai_core.view'), (_req, res) => {
  res.json({
    ok: true,
    configured: Boolean(process.env.AI_CORE_MASTER_KEY?.trim()),
  });
});

router.use('/connections', connections);
router.use('/models', models);
router.use('/logs', logs);
router.use('/usage', usage);
router.use('/agents', agents);

router.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  const databaseStatus = error?.code === '23505' ? 409 : error?.code === '22P02' ? 400 : null;
  const status = error instanceof AiCoreError
    ? error.httpStatus
    : (databaseStatus || (Number.isInteger(error.statusCode) ? error.statusCode : null));
  if (!status) return next(error);
  const code = error?.code === '23505' ? 'AI_CORE_ALREADY_EXISTS'
    : error?.code === '22P02' ? 'AI_CORE_INVALID_IDENTIFIER' : error.code || 'AI_CORE_ERROR';
  const message = databaseStatus ? (status === 409 ? 'Resource already exists.' : 'Invalid identifier.') : error.message;
  return res.status(status).json({ error: { code, message } });
});

module.exports = router;
