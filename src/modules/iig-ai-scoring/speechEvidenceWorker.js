const { createEvidenceWorker } = require('./evidenceWorkerFactory');
const {
  buildReadAloudEvidenceRequest,
  normalizeReadAloudSpeechEvidence,
} = require('./readAloudEvidenceContract');
const {
  buildFreeSpeechEvidenceRequest,
  normalizeFreeSpeechEvidence,
} = require('./freeSpeechEvidenceContract');

function buildRequest(task) {
  if (task.scorerType === 'READ_TEXT_ALOUD') {
    return buildReadAloudEvidenceRequest({
      aiInput: task.aiInput,
      transcript: task.transcript,
      deterministicFeatures: task.features.task?.deterministic,
    });
  }
  return buildFreeSpeechEvidenceRequest({ aiInput: task.aiInput, transcript: task.transcript });
}

function normalize(task, output) {
  return task.scorerType === 'READ_TEXT_ALOUD'
    ? normalizeReadAloudSpeechEvidence(output)
    : normalizeFreeSpeechEvidence(task.scorerType, output);
}

module.exports = createEvidenceWorker({
  stage: 'SPEECH_EVIDENCE',
  enabledEnv: 'IIG_AI_SPEECH_EVIDENCE_WORKER_ENABLED',
  concurrencyEnv: 'IIG_AI_SPEECH_EVIDENCE_CONCURRENCY',
  pollEnv: 'IIG_AI_SPEECH_EVIDENCE_POLL_MS',
  staleEnv: 'IIG_AI_SPEECH_EVIDENCE_STALE_MS',
  maxAttemptsEnv: 'IIG_AI_SPEECH_EVIDENCE_MAX_ATTEMPTS',
  buildRequest,
  normalize,
});

module.exports.buildRequest = buildRequest;
module.exports.normalize = normalize;
