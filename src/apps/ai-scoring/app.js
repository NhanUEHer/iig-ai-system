const createHttpApp = require('../shared/createHttpApp');
const { authenticate } = require('../../middleware/authenticate');
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
      app.use('/api/ai-scoring/tenants', authenticate, tenantRoutes);
      app.use('/api/ai-scoring', authenticate, credentialRoutes);
      app.use('/api/ai-scoring', authenticate, webhookRoutes);
      app.use('/api/ai-scoring', authenticate, jobRoutes);
      app.use('/api/ai-scoring', authenticate, auditRoutes);
    },
  });
}

module.exports = createAiScoringApp;
