require('dotenv').config();
const app = require('./app');
const initDb = require('./config/initDb');

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // 1. Initialize Postgres tables
    await initDb();
    
    // 2. Start Express app listening
    app.listen(PORT, () => {
      console.log(`🚀 AI Scoring Admin server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server due to DB initialization error:', error);
    process.exit(1);
  }
}

startServer();
