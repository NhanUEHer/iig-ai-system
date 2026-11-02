const createHttpApp = require('../shared/createHttpApp');
const { authenticate } = require('../../middleware/authenticate');
const { authenticateAiScoringService } = require('../../middleware/authenticateAiScoringService');
const integrationRoutes = require('../../routes/iigIntegrationRoutes');
const tenantRoutes = require('../../routes/aiScoringTenantRoutes');
const credentialRoutes = require('../../routes/aiScoringCredentialRoutes');
const webhookRoutes = require('../../routes/aiScoringWebhookRoutes');
const jobRoutes = require('../../routes/aiScoringJobRoutes');
const auditRoutes = require('../../routes/aiScoringAuditRoutes');

function createAiScoringApp(options = {}) {
  return createHttpApp({
    serviceName: 'ai-scoring-api',
    readiness: options.readiness,
    mountRoutes(app) {
      app.use('/api/integrations/iig', integrationRoutes);
      app.use('/api/admin/v1/tenants', authenticateAiScoringService, tenantRoutes);
      app.use('/api/admin/v1', authenticateAiScoringService, credentialRoutes);
      app.use('/api/admin/v1', authenticateAiScoringService, webhookRoutes);
      app.use('/api/admin/v1', authenticateAiScoringService, jobRoutes);
      app.use('/api/admin/v1', authenticateAiScoringService, auditRoutes);
      // Legacy routes remain during the BFF migration window.
      app.use('/api/ai-scoring/tenants', authenticate, tenantRoutes);
      app.use('/api/ai-scoring', authenticate, credentialRoutes);
      app.use('/api/ai-scoring', authenticate, webhookRoutes);
      app.use('/api/ai-scoring', authenticate, jobRoutes);
      app.use('/api/ai-scoring', authenticate, auditRoutes);
    },
  });
}

module.exports = createAiScoringApp;
