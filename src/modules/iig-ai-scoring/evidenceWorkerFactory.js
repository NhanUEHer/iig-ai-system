const { randomUUID } = require('node:crypto');
const repository = require('./evidenceWorkerRepository');
const { fingerprint } = require('./scoringPlan');

const DEFAULT_POLL_MS = 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_STALE_MS = 5 * 60 * 1000;
const DEFAULT_CONCURRENCY = 11;
const MAX_CONCURRENCY = 32;

function positiveInteger(value, fallback, minimum = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function enabled(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', '1', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function retryDelayMs(attempt) {
  return Math.min(5 * 60 * 1000, 5000 * (2 ** Math.max(0, attempt - 1)));
}

function classifyError(cause, stage) {
  if (cause?.retryable === false) return cause;
  return Object.assign(new Error(cause?.message || `${stage} provider failed.`), {
    code: cause?.code || `IIG_AI_${stage}_FAILED`,
    retryable: true,
    cause,
  });
}

function providerLineage(provider) {
  const lineage = provider?.describe?.();
  if (!lineage?.provider || !lineage?.modelName) {
    throw Object.assign(new Error('Evidence provider must declare provider and modelName.'), {
      code: 'IIG_AI_EVIDENCE_PROVIDER_LINEAGE_MISSING',
      retryable: false,
    });
  }
  return lineage;
}

function createEvidenceWorker({
  stage,
  enabledEnv,
  concurrencyEnv,
  pollEnv,
  staleEnv,
  maxAttemptsEnv,
  claimOptions = null,
  buildRequest,
  normalize,
}) {
  let timer = null;
  let batchRunning = false;
  const baseWorkerId = `iig-ai-${stage.toLowerCase()}-${process.pid}-${randomUUID()}`;

  async function processEvent(event, dependencies = {}) {
    const taskRepository = dependencies.repository || repository;
    const provider = dependencies.provider;
    const maxAttempts = positiveInteger(
      dependencies.maxAttempts ?? process.env[maxAttemptsEnv],
      DEFAULT_MAX_ATTEMPTS
    );
    let task = null;
    let executionId = null;
    try {
      if (!provider?.analyze) {
        throw Object.assign(new Error('Evidence provider is not configured.'), {
          code: 'IIG_AI_EVIDENCE_PROVIDER_MISSING',
          retryable: false,
        });
      }
      task = await taskRepository.loadTask(event, stage);
      const request = buildRequest(task);
      const lineage = providerLineage(provider);
      executionId = await taskRepository.startExecution({
        event,
        task,
        stage,
        lineage,
        requestHash: fingerprint(request),
      });
      const providerResult = await provider.analyze({ request, task, stage });
      if (!providerResult || typeof providerResult !== 'object') {
        throw Object.assign(new Error('Evidence provider returned no result.'), {
          code: 'IIG_AI_EVIDENCE_PROVIDER_RESULT_MISSING',
          retryable: true,
        });
      }
      const normalizedEvidence = normalize(task, providerResult.output);
      const completed = await taskRepository.completeTask({
        event,
        task,
        stage,
        executionId,
        normalizedEvidence,
        providerResult: {
          ...providerResult,
          responseHash: providerResult.responseHash || fingerprint(providerResult.output),
        },
      });
      return {
        status: completed.completed ? 'completed' : 'skipped',
        stage,
        runId: event.runId,
        questionRunId: task.questionRunId,
        ready: completed.ready,
        reason: completed.reason,
      };
    } catch (cause) {
      const error = classifyError(cause, stage);
      if (error.retryable && event.publishAttempts < maxAttempts) {
        const delayMs = retryDelayMs(event.publishAttempts);
        await taskRepository.markRetry({ event, task, executionId, error, delayMs });
        return { status: 'retry', stage, runId: event.runId, code: error.code, delayMs };
      }
      await taskRepository.markDeadLetter({ event, task, executionId, error });
      return { status: 'dead_letter', stage, runId: event.runId, code: error.code };
    }
  }

  async function runOnce(dependencies = {}) {
    const taskRepository = dependencies.repository || repository;
    const event = await taskRepository.claimNext(
      stage,
      dependencies.workerId || baseWorkerId,
      dependencies.claimOptions || claimOptions || {}
    );
    if (!event) return null;
    return processEvent(event, { ...dependencies, repository: taskRepository });
  }

  async function runBatch(dependencies = {}) {
    if (batchRunning) return [];
    batchRunning = true;
    const concurrency = Math.min(
      MAX_CONCURRENCY,
      positiveInteger(dependencies.concurrency ?? process.env[concurrencyEnv], DEFAULT_CONCURRENCY)
    );
    try {
      return await Promise.all(Array.from({ length: concurrency }, (_, index) => runOnce({
        ...dependencies,
        workerId: `${dependencies.workerId || baseWorkerId}-${index + 1}`,
      })));
    } finally {
      batchRunning = false;
    }
  }

  async function startWorker(dependencies = {}) {
    if (timer || !enabled(process.env[enabledEnv], false)) return timer;
    const taskRepository = dependencies.repository || repository;
    const staleMs = positiveInteger(dependencies.staleMs ?? process.env[staleEnv], DEFAULT_STALE_MS, 30_000);
    await taskRepository.recoverStale(stage, staleMs);
    const pollMs = positiveInteger(dependencies.pollMs ?? process.env[pollEnv], DEFAULT_POLL_MS, 250);
    timer = setInterval(() => runBatch({ ...dependencies, repository: taskRepository })
      .catch(error => console.error(`[${stage}Worker]`, error.message)), pollMs);
    timer.unref?.();
    await runBatch({ ...dependencies, repository: taskRepository });
    return timer;
  }

  function stopWorker() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { processEvent, runOnce, runBatch, startWorker, stopWorker };
}

module.exports = {
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  positiveInteger,
  retryDelayMs,
  classifyError,
  providerLineage,
  createEvidenceWorker,
};
