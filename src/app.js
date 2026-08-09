const express = require('express');
const cors = require('cors');
const submissionRoutes = require('./routes/submissionRoutes');
const authRoutes = require('./routes/authRoutes');
const agentRoutes = require('./routes/agentRoutes');
const localTtsRoutes = require('./routes/localTtsRoutes');
const reportRoutes = require('./routes/reportRoutes');
const requestContext = require('./http/requestContext');
const errorHandler = require('./http/errorHandler');
const HttpError = require('./http/httpError');
const { authenticate } = require('./middleware/authenticate');
const { getBuildInfo } = require('./config/buildInfo');

const path = require('path');
const app = express();

// Standard middlewares with increased payload limits for Base64 audio uploads
app.use(cors());
app.use(requestContext);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static directories
app.use('/cleaned-audio', express.static(path.join(__dirname, '../public/cleaned-audio')));
app.use('/local_audio', express.static(path.join(__dirname, '../public/local_audio')));
app.use('/local_voices', express.static(path.join(__dirname, '../public/local_voices')));
app.use('/tmp_local', express.static(path.join(__dirname, '../public/tmp_local')));

// Routes mapping
app.use('/api/auth', authRoutes);
app.use('/api/submissions', authenticate, submissionRoutes);
app.use('/api/agents', authenticate, agentRoutes);
app.use('/api/local-tts', authenticate, localTtsRoutes);
app.use('/api/reports', authenticate, reportRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date(), requestId: req.requestId, build: getBuildInfo() });
});

app.use((req, res, next) => next(new HttpError('Route not found.', 404, 'ROUTE_NOT_FOUND')));

// Centralized error handler middleware
app.use(errorHandler);

module.exports = app;
