const path = require('path');
const express = require('express');
const createHttpApp = require('../shared/createHttpApp');
const { authenticate } = require('../../middleware/authenticate');
const submissionRoutes = require('../../routes/submissionRoutes');
const authRoutes = require('../../routes/authRoutes');
const agentRoutes = require('../../routes/agentRoutes');
const reportRoutes = require('../../routes/reportRoutes');
const expenseRoutes = require('../../routes/expenseRoutes');
const keyVocabRoutes = require('../../routes/keyVocabRoutes');
const contentStudioRoutes = require('../../routes/contentStudioRoutes');
const secureLectureRoutes = require('../../routes/secureLectureRoutes');
const secureLecturePublicRoutes = require('../../routes/secureLecturePublicRoutes');
const aiCoreRoutes = require('../../modules/ai-core/routes');
const dictionaryRoutes = require('../../routes/dictionaryRoutes');
const learningMaterialRoutes = require('../../routes/learningMaterialRoutes');
const contentSourceRoutes = require('../../routes/contentSourceRoutes');
const questionBankRoutes = require('../../routes/questionBankV3Routes');
const examRoutes = require('../../routes/examV3Routes');
const scoreScaleRoutes = require('../../routes/scoreScaleRoutes');
const examCandidateRoutes = require('../../routes/examCandidateRoutes');
const publicExamCatalogRoutes = require('../../routes/publicExamCatalogRoutes');
const { createAiScoringAdminProxyRoutes } = require('../../routes/aiScoringAdminProxyRoutes');

function createAdminApp(options = {}) {
  return createHttpApp({
    serviceName: 'iig-admin-api',
    readiness: options.readiness,
    configure(app) {
      const publicRoot = path.join(__dirname, '../../../public');
      app.use('/cleaned-audio', express.static(path.join(publicRoot, 'cleaned-audio')));
      app.use('/question-bank-media', express.static(path.join(publicRoot, 'question-bank-media')));
    },
    mountRoutes(app) {
      app.use('/api/public/exams', publicExamCatalogRoutes);
      app.use('/api/public/lectures', secureLecturePublicRoutes);
      app.use('/api/auth', authRoutes);
      app.use('/api/ai-scoring', authenticate, createAiScoringAdminProxyRoutes(options.aiScoringAdminProxy));
      app.use('/api/submissions', authenticate, submissionRoutes);
      app.use('/api/agents', authenticate, agentRoutes);
      app.use('/api/reports', authenticate, reportRoutes);
      app.use('/api/expenses', authenticate, expenseRoutes);
      app.use('/api/key-vocab', authenticate, keyVocabRoutes);
      app.use('/api/content-studio', authenticate, contentStudioRoutes);
      app.use('/api/secure-lectures', authenticate, secureLectureRoutes);
      app.use('/api/ai-core', authenticate, aiCoreRoutes);
      app.use('/api/dictionary', authenticate, dictionaryRoutes);
      app.use('/api/learning-materials', authenticate, learningMaterialRoutes);
      app.use('/api/content-sources', authenticate, contentSourceRoutes);
      app.use('/api/question-bank', authenticate, questionBankRoutes);
      app.use('/api/exams', authenticate, examRoutes);
      app.use('/api/score-scales', authenticate, scoreScaleRoutes);
      app.use('/api/exam-candidates', authenticate, examCandidateRoutes);
    },
  });
}

module.exports = createAdminApp;
