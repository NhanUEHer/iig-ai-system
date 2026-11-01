const workers = [
  ['source-fetch', require('../../modules/iig-ingestion/sourceFetchWorker')],
  ['source-sync', require('../../modules/iig-ingestion/sourceSyncWorker')],
  ['media-preparation', require('../../modules/iig-ingestion/mediaPreparationWorker')],
  ['input-validation', require('../../modules/iig-ingestion/inputValidationWorker')],
  ['question-transcription', require('../../modules/iig-ingestion/questionTranscriptionWorker')],
  ['scoring-run-creation', require('../../modules/iig-ingestion/scoringRunCreationWorker')],
  ['scoring-orchestrator', require('../../modules/iig-ai-scoring/orchestratorWorker')],
  ['answer-transcription', require('../../modules/iig-ai-scoring/answerTranscriptionWorker')],
  ['feature-extraction', require('../../modules/iig-ai-scoring/featureExtractionWorker')],
  ['rta-speech-evidence', require('../../modules/iig-ai-scoring/rtaSpeechEvidenceWorker')],
  ['rta-question-scoring', require('../../modules/iig-ai-scoring/rtaQuestionScoringWorker')],
  ['rta-group-scoring', require('../../modules/iig-ai-scoring/rtaGroupScoringWorker')],
  ['describe-picture-question', require('../../modules/iig-ai-scoring/describePictureQuestionScoringWorker')],
  ['describe-picture-group', require('../../modules/iig-ai-scoring/describePictureGroupScoringWorker')],
  ['extended-speaking-question', require('../../modules/iig-ai-scoring/extendedSpeakingQuestionScoringWorker')],
  ['q5-q10-group', require('../../modules/iig-ai-scoring/q5Q10GroupScoringWorker')],
  ['express-opinion-question', require('../../modules/iig-ai-scoring/expressOpinionQuestionScoringWorker')],
  ['writing-question', require('../../modules/iig-ai-scoring/writingQuestionScoringWorker')],
  ['writing-q1-q5-group', require('../../modules/iig-ai-scoring/writingQ1Q5GroupScoringWorker')],
  ['extended-writing-question', require('../../modules/iig-ai-scoring/extendedWritingQuestionScoringWorker')],
  ['webhook-delivery', require('../../modules/ai-scoring-webhooks/webhookWorker')],
];

function createWorkerRegistry(entries = workers) {
  let started = [];
  return {
    names: entries.map(([name]) => name),
    isReady: () => started.length === entries.length,
    status: () => ({ started: started.map(([name]) => name), expected: entries.map(([name]) => name) }),
    async start() {
      try {
        for (const [name, worker] of entries) {
          await worker.startWorker();
          started.push([name, worker]);
        }
      } catch (error) {
        for (const [, worker] of [...started].reverse()) worker.stopWorker();
        started = [];
        throw error;
      }
    },
    stop() {
      for (const [, worker] of [...started].reverse()) worker.stopWorker();
      started = [];
    },
  };
}

module.exports = { createWorkerRegistry, workers };
