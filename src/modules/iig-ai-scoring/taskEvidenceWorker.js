const { createEvidenceWorker } = require('./evidenceWorkerFactory');
const { buildTaskEvidenceRequest, normalizeTaskEvidence } = require('./taskEvidenceContract');

function buildRequest(task) {
  return buildTaskEvidenceRequest({ aiInput: task.aiInput, transcript: task.transcript });
}

function normalize(task, output) {
  return normalizeTaskEvidence(task.scorerType, output);
}

module.exports = createEvidenceWorker({
  stage: 'TASK_EVIDENCE',
  enabledEnv: 'IIG_AI_TASK_EVIDENCE_WORKER_ENABLED',
  concurrencyEnv: 'IIG_AI_TASK_EVIDENCE_CONCURRENCY',
  pollEnv: 'IIG_AI_TASK_EVIDENCE_POLL_MS',
  staleEnv: 'IIG_AI_TASK_EVIDENCE_STALE_MS',
  maxAttemptsEnv: 'IIG_AI_TASK_EVIDENCE_MAX_ATTEMPTS',
  buildRequest,
  normalize,
});

module.exports.buildRequest = buildRequest;
module.exports.normalize = normalize;
