const redis = require('../../config/redis');

const SCHEMA = 'v2';
const MIN_TTL_SECONDS = 3600;
const MAX_TTL_SECONDS = 7 * 24 * 60 * 60;
const metaKey = attemptId => `exam:attempt:meta:${SCHEMA}:${attemptId}`;
const answersKey = attemptId => `exam:attempt:answers:${SCHEMA}:${attemptId}`;

function ttlFor(expiresAt) {
  const remaining = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000) + 86400;
  return Math.max(MIN_TTL_SECONDS, Math.min(MAX_TTL_SECONDS, remaining));
}

async function writeMeta(attempt) {
  if (!redis.configured() || !attempt?.id) return false;
  const meta = {
    id: attempt.id,
    candidateId: attempt.candidate_id || attempt.candidateId,
    examId: attempt.exam_id || attempt.examId,
    versionId: attempt.exam_version_id || attempt.versionId,
    status: attempt.status,
    startedAt: attempt.started_at || attempt.startedAt,
    expiresAt: attempt.expires_at || attempt.expiresAt,
  };
  const ttl = ttlFor(meta.expiresAt);
  await redis.set(metaKey(meta.id), JSON.stringify(meta), { EX: ttl });
  await redis.expire(answersKey(meta.id), ttl);
  return true;
}

async function readMeta(attemptId) {
  const raw = await redis.get(metaKey(attemptId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch { await redis.remove(metaKey(attemptId)); return null; }
}

async function save(attemptId, subQuestionId, answer, expiresAt) {
  if (!redis.configured()) return false;
  const value = JSON.stringify({
    subQuestionId,
    selectedOptionKey: answer.selectedOptionKey || null,
    textAnswer: answer.textAnswer ?? null,
    flagged: answer.flagged === true,
    savedAt: answer.savedAt || new Date().toISOString(),
  });
  const result = await redis.hSetExpiring(answersKey(attemptId), subQuestionId, value, ttlFor(expiresAt));
  if (result == null) return false;
  return true;
}

async function readAll(attemptId) {
  if (!redis.configured()) return null;
  const values = await redis.hGetAll(answersKey(attemptId));
  if (values == null) return null;
  return Object.values(values).flatMap(raw => {
    try { return [JSON.parse(raw)]; } catch { return []; }
  });
}

async function hydrate(attemptId, answers, expiresAt) {
  if (!redis.configured()) return false;
  const values = Object.fromEntries((answers || []).filter(answer => answer?.subQuestionId).map(answer => [
    answer.subQuestionId,
    JSON.stringify({
      subQuestionId: answer.subQuestionId,
      selectedOptionKey: answer.selectedOptionKey || null,
      textAnswer: answer.textAnswer ?? null,
      flagged: answer.flagged === true,
      savedAt: answer.savedAt || new Date().toISOString(),
    }),
  ]));
  const result = await redis.hSetManyExpiring(answersKey(attemptId), values, ttlFor(expiresAt));
  return result != null;
}

async function markSubmitted(attemptId) {
  const meta = await readMeta(attemptId);
  if (meta) {
    const submitted = { ...meta, status: 'SUBMITTED' };
    await redis.set(metaKey(attemptId), JSON.stringify(submitted), { EX: 86400 });
  }
  await redis.expire(answersKey(attemptId), 86400);
}

module.exports = { writeMeta, readMeta, save, readAll, hydrate, markSubmitted, metaKey, answersKey };
