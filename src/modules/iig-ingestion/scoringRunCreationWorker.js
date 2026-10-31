const { randomUUID } = require('node:crypto');
const repository = require('./scoringRunCreationRepository');
const scoringRunService = require('../iig-ai-scoring/scoringRunService');

const DEFAULT_POLL_MS = 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_STALE_MS = 5 * 60 * 1000;

function positiveInteger(value, fallback, minimum = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function retryDelayMs(attempt) {
  return Math.min(5 * 60 * 1000, 5000 * (2 ** Math.max(0, attempt - 1)));
}

const CREATORS = {
  READ_TEXT_ALOUD: 'createReadAloudRun',
  DESCRIBE_PICTURE: 'createDescribePictureRun',
  RESPOND_Q5_Q10: 'createRespondQ5Q10Run',
  EXPRESS_OPINION: 'createExpressOpinionRun',
  WRITE_SENTENCE_Q1_Q5: 'createWritingRun',
  WRITTEN_REQUEST_Q6_Q7: 'createWrittenRequestRun',
  OPINION_ESSAY_Q8: 'createOpinionEssayRun',
};

async function processEvent(event, dependencies = {}) {
  const taskRepository = dependencies.repository || repository;
  const service = dependencies.scoringRunService || scoringRunService;
  const maxAttempts = positiveInteger(
    dependencies.maxAttempts ?? process.env.IIG_AI_RUN_CREATION_MAX_ATTEMPTS,
    DEFAULT_MAX_ATTEMPTS
  );
  try {
    const submissionId = String(event.payload?.submissionId || '').trim();
    const groups = [...new Set(Array.isArray(event.payload?.groups) ? event.payload.groups : [])];
    if (!submissionId || !groups.length || groups.some(group => !CREATORS[group])) {
      throw Object.assign(new Error('AI scoring run request has invalid submission or groups.'), {
        code: 'IIG_AI_RUN_CREATION_INPUT_INVALID', retryable: false,
      });
    }
    const plan = await taskRepository.beginPlan(event, groups);
    if (!plan) return { status: 'skipped', jobId: event.jobId, reason: 'LEASE_LOST' };
    const runs = [];
    for (const group of groups) {
      const result = await service[CREATORS[group]](submissionId, { planId: plan.id });
      runs.push({ group, runId: result.run.id, replayed: result.replayed });
    }
    await taskRepository.complete(event, runs, plan.id);
    return { status: 'completed', jobId: event.jobId, runs };
  } catch (cause) {
    const error = Object.assign(new Error(cause?.message || 'AI scoring run creation failed.'), {
      code: cause?.code || 'IIG_AI_RUN_CREATION_FAILED',
      retryable: cause?.retryable !== false,
    });
    if (error.retryable && event.publishAttempts < maxAttempts) {
      const delayMs = retryDelayMs(event.publishAttempts);
      await taskRepository.markRetry({ event, error, delayMs });
      return { status: 'retry', jobId: event.jobId, code: error.code, delayMs };
    }
    await taskRepository.markDeadLetter({ event, error });
    return { status: 'dead_letter', jobId: event.jobId, code: error.code };
  }
}

let timer = null;
let running = false;
const workerId = `ai-run-creation-${process.pid}-${randomUUID()}`;

async function runOnce(dependencies = {}) {
  if (running) return null;
  running = true;
  const taskRepository = dependencies.repository || repository;
  try {
    const event = await taskRepository.claimNext(dependencies.workerId || workerId);
    if (!event) return null;
    return processEvent(event, { ...dependencies, repository: taskRepository });
  } finally {
    running = false;
  }
}

async function startWorker(dependencies = {}) {
  if (timer || String(process.env.IIG_AI_RUN_CREATION_WORKER_ENABLED || 'false') !== 'true') return timer;
  const taskRepository = dependencies.repository || repository;
  const staleMs = positiveInteger(process.env.IIG_AI_RUN_CREATION_STALE_MS, DEFAULT_STALE_MS, 30_000);
  await taskRepository.recoverStale(staleMs);
  if (typeof taskRepository.reconcileSealedPlans === 'function') {
    await taskRepository.reconcileSealedPlans();
  }
  const pollMs = positiveInteger(process.env.IIG_AI_RUN_CREATION_POLL_MS, DEFAULT_POLL_MS, 250);
  timer = setInterval(() => runOnce({ ...dependencies, repository: taskRepository })
    .catch(error => console.error('[IigAiRunCreationWorker]', error.message)), pollMs);
  timer.unref?.();
  await runOnce({ ...dependencies, repository: taskRepository });
  return timer;
}

function stopWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { positiveInteger, retryDelayMs, processEvent, runOnce, startWorker, stopWorker };
