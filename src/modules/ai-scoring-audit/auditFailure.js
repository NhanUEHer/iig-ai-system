const repository = require('./auditRepository');

async function recordFailedMutation(req, error, { action, resourceType, resourceId, tenantId }) {
  try {
    await repository.recordFailure({
      actorId: req.auth?.userId, action, resourceType,
      resourceId: typeof resourceId === 'function' ? resourceId(req) : resourceId,
      tenantId: typeof tenantId === 'function' ? tenantId(req) : tenantId,
      reason: typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 1000) : null,
      requestId: req.requestId, error,
    });
  } catch (auditError) {
    console.error('[AiScoringAuditFailure]', auditError.message);
  }
}

function audited(action, resourceType, options, handler) {
  return async (req, res) => {
    try { return await handler(req, res); }
    catch (error) {
      await recordFailedMutation(req, error, { action, resourceType, ...options });
      throw error;
    }
  };
}

module.exports = { audited, recordFailedMutation };
