// Keep rotated/local secrets outside the shared .env. Values loaded first win.
require('dotenv').config({ path: ['.env.r2.local', '.env'] });
const app = require('./app');
const initDb = require('./config/initDb');
const db = require('./config/db');
const { validateEnv } = require('./config/env');
const { getBuildInfo } = require('./config/buildInfo');
const mappingSyncScheduler = require('./services/mappingSyncScheduler');
const dictionaryService = require('./modules/dictionary/dictionaryService');
const storageService = require('./services/storageService');
const redis = require('./config/redis');
const iigSourceFetchWorker = require('./modules/iig-ingestion/sourceFetchWorker');
const iigSourceSyncWorker = require('./modules/iig-ingestion/sourceSyncWorker');
const iigMediaPreparationWorker = require('./modules/iig-ingestion/mediaPreparationWorker');
const iigInputValidationWorker = require('./modules/iig-ingestion/inputValidationWorker');
const iigQuestionTranscriptionWorker = require('./modules/iig-ingestion/questionTranscriptionWorker');
const iigScoringRunCreationWorker = require('./modules/iig-ingestion/scoringRunCreationWorker');
const iigAiScoringOrchestrator = require('./modules/iig-ai-scoring/orchestratorWorker');
const iigAiAnswerSttWorker = require('./modules/iig-ai-scoring/answerTranscriptionWorker');
const iigAiFeatureExtractionWorker = require('./modules/iig-ai-scoring/featureExtractionWorker');
const iigAiRtaSpeechEvidenceWorker = require('./modules/iig-ai-scoring/rtaSpeechEvidenceWorker');
const iigAiRtaQuestionScoringWorker = require('./modules/iig-ai-scoring/rtaQuestionScoringWorker');
const iigAiRtaGroupScoringWorker = require('./modules/iig-ai-scoring/rtaGroupScoringWorker');
const iigAiDescribePictureQuestionScoringWorker = require('./modules/iig-ai-scoring/describePictureQuestionScoringWorker');
const iigAiDescribePictureGroupScoringWorker = require('./modules/iig-ai-scoring/describePictureGroupScoringWorker');
const iigAiExtendedSpeakingQuestionScoringWorker = require('./modules/iig-ai-scoring/extendedSpeakingQuestionScoringWorker');
const iigAiQ5Q10GroupScoringWorker = require('./modules/iig-ai-scoring/q5Q10GroupScoringWorker');
const iigAiExpressOpinionQuestionScoringWorker = require('./modules/iig-ai-scoring/expressOpinionQuestionScoringWorker');
const iigAiWritingQuestionScoringWorker = require('./modules/iig-ai-scoring/writingQuestionScoringWorker');
const iigAiWritingGroupScoringWorker = require('./modules/iig-ai-scoring/writingQ1Q5GroupScoringWorker');
const iigAiExtendedWritingQuestionScoringWorker = require('./modules/iig-ai-scoring/extendedWritingQuestionScoringWorker');
const aiScoringWebhookWorker = require('./modules/ai-scoring-webhooks/webhookWorker');

async function startServer() {
  let server;
  try {
    const { port } = validateEnv();
    storageService.requireProductionR2();
    // 1. Initialize Postgres tables
    await initDb();

    // 2. Start Express app listening
    server = app.listen(port, () => {
      const build = getBuildInfo();
      console.log(`🚀 AI Scoring Admin ${build.label} v${build.version} running on http://localhost:${port}`);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${port} is already in use by a stale process. Please terminate the process on port ${port} before restarting.`);
        process.exit(1);
      } else {
        console.error('❌ Server failed with error:', err);
        process.exit(1);
      }
    });
    mappingSyncScheduler.start();
    await dictionaryService.startWorker();
    await iigSourceFetchWorker.startWorker();
    await iigSourceSyncWorker.startWorker();
    await iigMediaPreparationWorker.startWorker();
    await iigInputValidationWorker.startWorker();
    await iigQuestionTranscriptionWorker.startWorker();
    await iigScoringRunCreationWorker.startWorker();
    await iigAiScoringOrchestrator.startWorker();
    await iigAiAnswerSttWorker.startWorker();
    await iigAiFeatureExtractionWorker.startWorker();
    await iigAiRtaSpeechEvidenceWorker.startWorker();
    await iigAiRtaQuestionScoringWorker.startWorker();
    await iigAiRtaGroupScoringWorker.startWorker();
    await iigAiDescribePictureQuestionScoringWorker.startWorker();
    await iigAiDescribePictureGroupScoringWorker.startWorker();
    await iigAiExtendedSpeakingQuestionScoringWorker.startWorker();
    await iigAiQ5Q10GroupScoringWorker.startWorker();
    await iigAiExpressOpinionQuestionScoringWorker.startWorker();
    await iigAiWritingQuestionScoringWorker.startWorker();
    await iigAiWritingGroupScoringWorker.startWorker();
    await iigAiExtendedWritingQuestionScoringWorker.startWorker();
    await aiScoringWebhookWorker.startWorker();

    const shutdown = signal => {
      console.log(`${signal} received; shutting down gracefully.`);
      server.close(async () => {
        mappingSyncScheduler.stop();
        dictionaryService.stopWorker();
        iigSourceFetchWorker.stopWorker();
        iigSourceSyncWorker.stopWorker();
        iigMediaPreparationWorker.stopWorker();
        iigInputValidationWorker.stopWorker();
        iigQuestionTranscriptionWorker.stopWorker();
        iigScoringRunCreationWorker.stopWorker();
        iigAiScoringOrchestrator.stopWorker();
        iigAiAnswerSttWorker.stopWorker();
        iigAiFeatureExtractionWorker.stopWorker();
        iigAiRtaSpeechEvidenceWorker.stopWorker();
        iigAiRtaQuestionScoringWorker.stopWorker();
        iigAiRtaGroupScoringWorker.stopWorker();
        iigAiDescribePictureQuestionScoringWorker.stopWorker();
        iigAiDescribePictureGroupScoringWorker.stopWorker();
        iigAiExtendedSpeakingQuestionScoringWorker.stopWorker();
        iigAiQ5Q10GroupScoringWorker.stopWorker();
        iigAiExpressOpinionQuestionScoringWorker.stopWorker();
        iigAiWritingQuestionScoringWorker.stopWorker();
        iigAiWritingGroupScoringWorker.stopWorker();
        iigAiExtendedWritingQuestionScoringWorker.stopWorker();
        aiScoringWebhookWorker.stopWorker();
        await redis.close();
        await db.close();
        process.exit(0);
      });
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('❌ Failed to start server due to DB initialization error:', error);
    process.exit(1);
  }
}

if (require.main === module) startServer();

module.exports = startServer;
