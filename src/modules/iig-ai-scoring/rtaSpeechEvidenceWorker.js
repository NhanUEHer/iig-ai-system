const { createEvidenceWorker } = require('./evidenceWorkerFactory');
const {
  READ_ALOUD_SPEECH_EVIDENCE_SCHEMA_VERSION,
  buildReadAloudEvidenceRequest,
  normalizeReadAloudSpeechEvidence,
} = require('./readAloudEvidenceContract');
const { READ_ALOUD_EVIDENCE_CONTRACT_VERSION } = require('./evidenceContractRegistry');
const { provider: defaultProvider } = require('./azureRtaEvidenceProvider');

function buildRequest(task) {
  return buildReadAloudEvidenceRequest({
    aiInput: task.aiInput,
    transcript: task.transcript,
    deterministicFeatures: task.features.task?.deterministic,
  });
}

const worker = createEvidenceWorker({
  stage: 'SPEECH_EVIDENCE',
  enabledEnv: 'IIG_AI_RTA_EVIDENCE_WORKER_ENABLED',
  concurrencyEnv: 'IIG_AI_RTA_EVIDENCE_CONCURRENCY',
  pollEnv: 'IIG_AI_RTA_EVIDENCE_POLL_MS',
  staleEnv: 'IIG_AI_RTA_EVIDENCE_STALE_MS',
  maxAttemptsEnv: 'IIG_AI_RTA_EVIDENCE_MAX_ATTEMPTS',
  claimOptions: {
    scorerTypes: ['READ_TEXT_ALOUD'],
    evidenceContractVersion: READ_ALOUD_EVIDENCE_CONTRACT_VERSION,
  },
  buildRequest,
  normalize: (_task, output) => normalizeReadAloudSpeechEvidence(output),
});

function dependenciesWithProvider(dependencies = {}) {
  return { ...dependencies, provider: dependencies.provider || defaultProvider };
}

module.exports = {
  schemaVersion: READ_ALOUD_SPEECH_EVIDENCE_SCHEMA_VERSION,
  buildRequest,
  processEvent: (event, dependencies) => worker.processEvent(event, dependenciesWithProvider(dependencies)),
  runOnce: dependencies => worker.runOnce(dependenciesWithProvider(dependencies)),
  runBatch: dependencies => worker.runBatch(dependenciesWithProvider(dependencies)),
  startWorker: dependencies => worker.startWorker(dependenciesWithProvider(dependencies)),
  stopWorker: worker.stopWorker,
};
