const path = require('path');
const express = require('express');
const createHttpApp = require('../shared/createHttpApp');
const { authenticate } = require('../../middleware/authenticate');
const submissionRoutes = require('../../routes/submissionRoutes');
const authRoutes = require('../../routes/authRoutes');
const agentRoutes = require('../../routes/agentRoutes');
const localTtsRoutes = require('../../routes/localTtsRoutes');
const reportRoutes = require('../../routes/reportRoutes');
const expenseRoutes = require('../../routes/expenseRoutes');
const keyVocabRoutes = require('../../routes/keyVocabRoutes');
const dictionaryRoutes = require('../../routes/dictionaryRoutes');
const learningMaterialRoutes = require('../../routes/learningMaterialRoutes');
const contentSourceRoutes = require('../../routes/contentSourceRoutes');
const questionBankRoutes = require('../../routes/questionBankV3Routes');
const examRoutes = require('../../routes/examV3Routes');
const scoreScaleRoutes = require('../../routes/scoreScaleRoutes');
const examCandidateRoutes = require('../../routes/examCandidateRoutes');
const publicExamCatalogRoutes = require('../../routes/publicExamCatalogRoutes');

function createAdminApp(options = {}) {
  return createHttpApp({
    serviceName: 'iig-admin-api',
    readiness: options.readiness,
    configure(app) {
      const publicRoot = path.join(__dirname, '../../../public');
      app.use('/cleaned-audio', express.static(path.join(publicRoot, 'cleaned-audio')));
      app.use('/local_audio', express.static(path.join(publicRoot, 'local_audio')));
      app.use('/local_voices', express.static(path.join(publicRoot, 'local_voices')));
      app.use('/tmp_local', express.static(path.join(publicRoot, 'tmp_local')));
      app.use('/question-bank-media', express.static(path.join(publicRoot, 'question-bank-media')));
    },
    mountRoutes(app) {
      app.use('/api/public/exams', publicExamCatalogRoutes);
      app.use('/api/auth', authRoutes);
      app.use('/api/submissions', authenticate, submissionRoutes);
      app.use('/api/agents', authenticate, agentRoutes);
      app.use('/api/local-tts', authenticate, localTtsRoutes);
      app.use('/api/reports', authenticate, reportRoutes);
      app.use('/api/expenses', authenticate, expenseRoutes);
      app.use('/api/key-vocab', authenticate, keyVocabRoutes);
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
