const express = require('express');
const cors = require('cors');
const submissionRoutes = require('./routes/submissionRoutes');
const authRoutes = require('./routes/authRoutes');
const agentRoutes = require('./routes/agentRoutes');
const reportRoutes = require('./routes/reportRoutes');
const expenseRoutes = require('./routes/expenseRoutes');
const keyVocabRoutes = require('./routes/keyVocabRoutes');
const contentStudioRoutes = require('./routes/contentStudioRoutes');
const secureLectureRoutes = require('./routes/secureLectureRoutes');
const secureLecturePublicRoutes = require('./routes/secureLecturePublicRoutes');
const aiCoreRoutes = require('./modules/ai-core/routes');
const dictionaryRoutes = require('./routes/dictionaryRoutes');
const learningMaterialRoutes = require('./routes/learningMaterialRoutes');
const contentSourceRoutes = require('./routes/contentSourceRoutes');
const requestContext = require('./http/requestContext');
const { apiAccessLogger } = require('./http/apiAccessLogger');
const errorHandler = require('./http/errorHandler');
const HttpError = require('./http/httpError');
const { authenticate } = require('./middleware/authenticate');
const { getBuildInfo } = require('./config/buildInfo');
const db = require('./config/db');
const { createReadinessHandler } = require('./http/readinessHandler');
const questionBankV3Routes = require('./routes/questionBankV3Routes');
const examV3Routes = require('./routes/examV3Routes');
const scoreScaleRoutes = require('./routes/scoreScaleRoutes');
const examCandidateRoutes = require('./routes/examCandidateRoutes');
const publicExamCatalogRoutes = require('./routes/publicExamCatalogRoutes');

const path = require('path');
const app = express();

// Standard middlewares with increased payload limits for Base64 audio uploads
app.use(cors());
app.use(requestContext);
app.use(apiAccessLogger);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static directories
app.use('/question-bank-media', express.static(path.join(__dirname, '../public/question-bank-media')));

// Public candidate routes
app.use('/api/public/exams', publicExamCatalogRoutes);
app.use('/api/public/lectures', secureLecturePublicRoutes);

// Protected Admin Routes mapping
app.use('/api/auth', authRoutes);
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
app.use('/api/question-bank', authenticate, questionBankV3Routes);
app.use('/api/exams', authenticate, examV3Routes);
app.use('/api/score-scales', authenticate, scoreScaleRoutes);
app.use('/api/exam-candidates', authenticate, examCandidateRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date(), requestId: req.requestId, build: getBuildInfo() });
});

app.get('/health/ready', createReadinessHandler(db));

app.use((req, res, next) => next(new HttpError('Route not found.', 404, 'ROUTE_NOT_FOUND')));

// Centralized error handler middleware
app.use(errorHandler);

module.exports = app;
