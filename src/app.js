const express = require('express');
const cors = require('cors');
const submissionRoutes = require('./routes/submissionRoutes');
const authRoutes = require('./routes/authRoutes');
const agentRoutes = require('./routes/agentRoutes');

const app = express();

// Standard middlewares
app.use(cors());
app.use(express.json());

// Routes mapping
app.use('/api/submissions', submissionRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/agents', agentRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Centralized error handler middleware
app.use((err, req, res, next) => {
  console.error('💥 Unhandled Exception:', err.stack || err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal Server Error'
  });
});

module.exports = app;
