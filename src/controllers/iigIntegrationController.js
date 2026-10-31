const scoringJobService = require('../modules/iig-ingestion/scoringJobService');

module.exports = {
  async createScoringJob(req, res) {
    const result = await scoringJobService.create(req.body, {
      idempotencyKey: req.get('idempotency-key'),
      partner: req.integration.partner,
      tenantId: req.integration.tenantId,
      credentialId: req.integration.credentialId || null,
    });
    const job = result.job;
    return res.status(202).json({
      success: true,
      data: {
        jobId: job.id,
        keycode: job.keycode,
        scoringId: job.scoringId,
        status: job.status,
        replayed: result.replayed,
        statusUrl: `/api/integrations/iig/scoring-jobs/${job.id}`,
        acceptedAt: job.acceptedAt,
      },
    });
  },

  async getScoringJob(req, res) {
    const job = await scoringJobService.detail(req.params.jobId, {
      partner: req.integration.partner,
      tenantId: req.integration.tenantId,
    });
    return res.json({
      success: true,
      data: {
        jobId: job.id,
        keycode: job.keycode,
        scoringId: job.scoringId,
        status: job.status,
        progress: job.progress,
        error: job.error,
        acceptedAt: job.acceptedAt,
        startedAt: job.startedAt,
        updatedAt: job.updatedAt,
        completedAt: job.completedAt,
      },
    });
  },

  async retryScoringJob(req, res) {
    const result = await scoringJobService.retry(req.params.jobId, req.body, {
      idempotencyKey: req.get('idempotency-key'),
      partner: req.integration.partner,
      tenantId: req.integration.tenantId,
      credentialId: req.integration.credentialId || null,
    });
    const job = result.job;
    return res.status(202).json({
      success: true,
      data: {
        jobId: job.id,
        retryOfJobId: job.retryOfJobId,
        keycode: job.keycode,
        scoringId: job.scoringId,
        status: job.status,
        replayed: result.replayed,
        statusUrl: `/api/integrations/iig/scoring-jobs/${job.id}`,
        acceptedAt: job.acceptedAt,
      },
    });
  },
};
