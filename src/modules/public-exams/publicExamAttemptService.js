const HttpError = require('../../http/httpError');
const { validateCandidateRegistration } = require('../public-exam-events/publicCandidateValidator');
const { signCandidateToken, verifyCandidateToken, signAttemptToken, verifyAttemptToken } = require('../public-exam-events/publicCandidateToken');
const deliveryCache = require('../public-exam-events/examDeliveryCache');
const answerStore = require('../public-exam-events/attemptAnswerStore');
const repository = require('./publicExamAttemptRepository');
const scoring = require('./lrScoringService');

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validateId = (value, label) => {
  if (!uuidPattern.test(String(value || ''))) throw new HttpError(`${label} không hợp lệ.`, 400, 'INVALID_IDENTIFIER');
};

async function register(examId, input, options = {}) {
  validateId(examId, 'Đề thi');
  const data = validateCandidateRegistration(input, options.now || new Date());
  const result = await repository.registerCandidate(data);
  if (result.conflict) throw new HttpError('Email và số điện thoại đang thuộc hai hồ sơ khác nhau.', 409, 'CANDIDATE_IDENTITY_CONFLICT');
  const expiresAt = new Date((options.now || new Date()).getTime() + 365 * 24 * 60 * 60 * 1000);
  return {
    candidate: result.candidate,
    candidateToken: signCandidateToken({ candidateId: result.candidate.id, examId }, expiresAt),
    candidateTokenExpiresAt: expiresAt,
    resumed: result.resumed,
  };
}

function requireCandidate(token, examId) {
  const identity = verifyCandidateToken(token);
  if (identity.examId !== examId) throw new HttpError('Phiên đăng ký không thuộc đề thi này.', 403, 'CANDIDATE_EXAM_MISMATCH');
  return identity;
}

function requireAttempt(token, examId, attemptId, options = {}) {
  const identity = verifyAttemptToken(token, { ignoreExpiration: options.allowExpired === true });
  if (identity.examId !== examId || identity.attemptId !== attemptId) throw new HttpError('Phiên làm bài không hợp lệ.', 403, 'ATTEMPT_SCOPE_MISMATCH');
  return identity;
}

async function start(examId, token, input = {}, options = {}) {
  validateId(examId, 'Đề thi');
  validateId(input.clientSessionId, 'Phiên trình duyệt');
  const identity = requireCandidate(token, examId);
  const result = await repository.startAttempt(examId, identity.sub, {
    audioConfirmed: input.audioConfirmed === true,
    clientSessionId: input.clientSessionId,
    now: options.now || new Date(),
  });
  if (!result) throw new HttpError('Đề thi không tồn tại, chưa active hoặc chưa publish.', 409, 'PUBLIC_EXAM_UNAVAILABLE');
  if (result.conflict) {
    throw new HttpError(
      'Bài thi này đang được mở trên một trình duyệt hoặc thiết bị khác.',
      409,
      'ATTEMPT_ACTIVE_ON_ANOTHER_DEVICE',
    );
  }
  const attempt = result.attempt;
  await answerStore.writeMeta({ ...attempt, candidateId: identity.sub, examId });
  return {
    attemptId: attempt.id,
    attemptToken: signAttemptToken({ candidateId: identity.sub, examId, attemptId: attempt.id }, attempt.expires_at),
    startedAt: attempt.started_at,
    expiresAt: attempt.expires_at,
    status: attempt.status,
    resumed: result.resumed,
  };
}

async function attemptContext(examId, attemptId, token, options = {}) {
  validateId(examId, 'Đề thi'); validateId(attemptId, 'Lượt thi');
  const identity = requireAttempt(token, examId, attemptId);
  const attempt = await repository.findAttempt(examId, attemptId, identity.sub);
  if (!attempt) throw new HttpError('Không tìm thấy lượt thi.', 404, 'ATTEMPT_NOT_FOUND');
  const now = options.now || new Date();
  if (attempt.status !== 'IN_PROGRESS') throw new HttpError('Lượt thi không còn hiệu lực.', 409, 'ATTEMPT_NOT_IN_PROGRESS');
  if (new Date(attempt.expires_at) <= now) throw new HttpError('Lượt thi đã hết thời gian.', 409, 'ATTEMPT_EXPIRED');
  return { identity, attempt, now };
}

async function piece(examId, attemptId, token, type, id, options = {}) {
  const { identity, attempt, now } = await attemptContext(examId, attemptId, token, options);
  // Published delivery is immutable while an exam is ACTIVE and is warmed at
  // publish time. Read it before the attempt-local cache so a burst of users
  // entering the same exam does not rebuild the same bundle from PostgreSQL
  // once per attempt. The attempt-local/DB path remains the safe fallback for
  // Redis outages or an unwarmed generation.
  const published = await deliveryCache.readPublished(examId, type, id).catch(() => null);
  if (published?.payload) {
    return {
      attempt: {
        id: attempt.id,
        status: attempt.status,
        startedAt: attempt.started_at,
        expiresAt: attempt.expires_at,
        remainingSeconds: Math.max(0, Math.floor((new Date(attempt.expires_at) - now) / 1000)),
      },
      payload: published.payload,
      cache: 'PUBLISHED_HIT',
    };
  }
  const cached = await deliveryCache.getAttemptPieceOrBuild(attemptId, type, id, async () => {
    const source = await repository.findDelivery(examId, attemptId, identity.sub);
    if (!source) throw new HttpError('Không tìm thấy lượt thi.', 404, 'ATTEMPT_NOT_FOUND');
    return deliveryCache.buildDeliveryBundle(source.snapshot, source.media);
  });
  if (!cached.payload) throw new HttpError('Không tìm thấy nội dung trong lượt thi.', 404, 'ATTEMPT_CONTENT_NOT_FOUND');
  return {
    attempt: {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.started_at,
      expiresAt: attempt.expires_at,
      remainingSeconds: Math.max(0, Math.floor((new Date(attempt.expires_at) - now) / 1000)),
    },
    payload: cached.payload,
    cache: cached.cache,
  };
}

async function structure(examId, attemptId, token, options) {
  const result = await piece(examId, attemptId, token, 'structure', null, options);
  return { attempt: result.attempt, ...result.payload, cache: result.cache };
}

const savedTime = answer => {
  const value = new Date(answer?.savedAt || 0).getTime();
  return Number.isFinite(value) ? value : 0;
};

async function readAttemptAnswers(attemptId, { databaseFallback = false, hydrateCache = false, expiresAt = null } = {}) {
  // Redis is the hot path while an attempt is in progress. Reading the whole
  // PostgreSQL answer set on every group/question request creates avoidable DB
  // load and was the main source of latency during navigation.
  const redisAnswers = await answerStore.readAll(attemptId).catch(() => null);
  let answers = redisAnswers;
  // Submit merges the indexed durable rows with Redis. This covers an attempt
  // that temporarily fell back to PostgreSQL and later resumed writing Redis.
  if (databaseFallback || redisAnswers == null) {
    const databaseAnswers = await repository.findAnswers(attemptId);
    const durable = databaseAnswers.map(answer => ({
      subQuestionId: answer.sub_question_id,
      selectedOptionKey: answer.selected_option,
      flagged: answer.is_flagged === true,
      savedAt: answer.answered_at,
    }));
    const merged = new Map(durable.map(answer => [answer.subQuestionId, answer]));
    for (const answer of redisAnswers || []) {
      const current = merged.get(answer.subQuestionId);
      if (!current || savedTime(answer) >= savedTime(current)) merged.set(answer.subQuestionId, answer);
    }
    answers = [...merged.values()];
    if (hydrateCache && expiresAt) await answerStore.hydrate(attemptId, answers, expiresAt).catch(() => false);
  }

  return new Map((answers || []).map(answer => [answer.subQuestionId, answer]));
}

async function resume(examId, attemptId, token, options = {}) {
  validateId(examId, 'Đề thi'); validateId(attemptId, 'Lượt thi');
  const identity = requireAttempt(token, examId, attemptId, { allowExpired: true });
  const attempt = await repository.findAttempt(examId, attemptId, identity.sub);
  if (!attempt) throw new HttpError('Không tìm thấy lượt thi.', 404, 'ATTEMPT_NOT_FOUND');
  if (attempt.status !== 'IN_PROGRESS') throw new HttpError('Lượt thi không còn hiệu lực.', 409, 'ATTEMPT_NOT_IN_PROGRESS');
  const answers = await readAttemptAnswers(attemptId, {
    databaseFallback: true,
    hydrateCache: true,
    expiresAt: attempt.expires_at,
  });
  const now = options.now || new Date();
  return {
    attemptId,
    status: attempt.status,
    startedAt: attempt.started_at,
    expiresAt: attempt.expires_at,
    remainingSeconds: Math.max(0, Math.floor((new Date(attempt.expires_at) - now) / 1000)),
    answeredQuestionIds: [...answers.values()].filter(answer => answer.selectedOptionKey).map(answer => answer.subQuestionId),
  };
}

async function partQuestions(examId, attemptId, partId, token, options) {
  validateId(partId, 'Part');
  const result = await piece(examId, attemptId, token, 'partQuestions', partId, options);
  const byId = await readAttemptAnswers(attemptId);
  return { attempt: result.attempt, ...result.payload,
    questions: result.payload.questions.map(question => ({ ...question, answered: Boolean(byId.get(question.id)?.selectedOptionKey) })),
    cache: result.cache };
}

async function questionGroup(examId, attemptId, parentQuestionId, token, options) {
  validateId(parentQuestionId, 'Nhóm câu hỏi');
  const result = await piece(examId, attemptId, token, 'questionGroup', parentQuestionId, options);
  const byId = await readAttemptAnswers(attemptId);
  return { attempt: result.attempt, questionGroup: { ...result.payload,
    questions: result.payload.questions.map(question => ({ ...question,
      selectedOption: byId.get(question.id)?.selectedOptionKey || null })) }, cache: result.cache };
}

async function saveAnswer(examId, attemptId, subQuestionId, token, input = {}, options = {}) {
  validateId(subQuestionId, 'Câu hỏi');
  const { identity, attempt, now } = await attemptContext(examId, attemptId, token, options);
  const grading = await deliveryCache.getGradingOrBuild(`attempt:${attemptId}`, async () => {
    const source = await repository.findDelivery(examId, attemptId, identity.sub);
    return source.snapshot;
  });
  const target = grading.questions[subQuestionId];
  if (!target) throw new HttpError('Câu hỏi không thuộc lượt thi.', 404, 'SUB_QUESTION_NOT_FOUND');
  const selectedOption = input.selectedOptionKey == null ? null : String(input.selectedOptionKey).trim();
  if (selectedOption && !target.optionKeys.includes(selectedOption)) throw new HttpError('Đáp án không hợp lệ.', 400, 'INVALID_SELECTED_OPTION');
  const answer = { selectedOptionKey: selectedOption, flagged: input.flagged === true, savedAt: now.toISOString() };
  const cached = await answerStore.save(attemptId, subQuestionId, answer, attempt.expires_at);
  if (!cached) {
    const saved = await repository.saveAnswer({ examId, attemptId, candidateId: identity.sub,
      parentQuestionId: target.parentQuestionId, subQuestionId, selectedOption, flagged: answer.flagged, now });
    if (!saved) throw new HttpError('Không thể lưu vì lượt thi đã kết thúc.', 409, 'ATTEMPT_NOT_IN_PROGRESS');
  }
  return { subQuestionId, ...answer, storage: cached ? 'REDIS' : 'POSTGRESQL_FALLBACK' };
}

async function submit(examId, attemptId, token, options = {}) {
  validateId(examId, 'Đề thi'); validateId(attemptId, 'Lượt thi');
  const identity = requireAttempt(token, examId, attemptId, { allowExpired: true });
  const now = options.now || new Date();
  const attempt = await repository.findAttempt(examId, attemptId, identity.sub);
  if (!attempt) throw new HttpError('Không tìm thấy lượt thi.', 404, 'ATTEMPT_NOT_FOUND');
  if (!['IN_PROGRESS', 'EXPIRED', 'SUBMITTED'].includes(attempt.status)) throw new HttpError('Lượt thi không thể nộp ở trạng thái hiện tại.', 409, 'ATTEMPT_NOT_SUBMITTABLE');
  if (attempt.status === 'SUBMITTED') {
    const stored = await repository.findStoredResult(examId, attemptId, identity.sub);
    if (!stored) throw new HttpError('Kết quả bài thi chưa sẵn sàng.', 404, 'ATTEMPT_RESULT_NOT_FOUND');
    return submitResponse(attemptId, stored.attempt, stored.evaluation, true);
  }
  const source = await repository.findDelivery(examId, attemptId, identity.sub);
  const grading = await deliveryCache.getGradingOrBuild(`attempt:${attemptId}`, async () => source.snapshot);
  const answerById = await readAttemptAnswers(attemptId, { databaseFallback: true });
  const evaluation = scoring.evaluate({ grading, answers: [...answerById.values()] });
  const result = await repository.finalize({ examId, attemptId, candidateId: identity.sub, evaluation, now });
  if (!result) throw new HttpError('Không tìm thấy lượt thi.', 404, 'ATTEMPT_NOT_FOUND');
  if (result.unavailable) throw new HttpError('Lượt thi không thể nộp ở trạng thái hiện tại.', 409, 'ATTEMPT_NOT_SUBMITTABLE');
  await answerStore.markSubmitted(attemptId).catch(() => false);
  const finalEvaluation = result.evaluation || evaluation;
  return submitResponse(attemptId, result.attempt, finalEvaluation, result.alreadySubmitted);
}

function submitResponse(attemptId, attempt, evaluation, alreadySubmitted) {
  return {
    attemptId,
    status: 'SUBMITTED',
    submittedAt: attempt.submitted_at,
    totalScore: Number(attempt.total_score ?? evaluation.totalScore ?? 0),
    totalQuestions: evaluation.totalQuestions,
    answeredCount: evaluation.answeredCount,
    unansweredCount: evaluation.unansweredCount,
    correctCount: evaluation.correctCount,
    incorrectCount: evaluation.incorrectCount,
    scoreRange: { min: evaluation.scoreRangeMin, max: evaluation.scoreRangeMax },
    maxScore: evaluation.maxScore,
    sections: evaluation.sectionResults || [],
    scoringVersion: evaluation.scoringVersion,
    durationSeconds: Number(attempt.duration_seconds || 0),
    alreadySubmitted: alreadySubmitted === true,
  };
}

function maskLeaderboardName(fullName) {
  const words = String(fullName || 'Thí sinh').trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words[0] || 'Thí sinh';
  return `${words.slice(0, -1).join(' ')} ${words.at(-1).charAt(0)}.`;
}

function percent(value, total) {
  return total > 0 ? Math.round((Number(value || 0) / total) * 1000) / 10 : 0;
}

async function result(examId, attemptId, token) {
  validateId(examId, 'Đề thi'); validateId(attemptId, 'Lượt thi');
  const identity = requireAttempt(token, examId, attemptId, { allowExpired: true });
  const [stored, presentation] = await Promise.all([
    repository.findStoredResult(examId, attemptId, identity.sub),
    repository.findResultPresentation(examId, attemptId, identity.sub),
  ]);
  if (!stored) throw new HttpError('Kết quả bài thi chưa sẵn sàng.', 404, 'ATTEMPT_RESULT_NOT_FOUND');
  const meta = presentation.meta || {};
  const evaluation = stored.evaluation;
  const durationSeconds = Number(stored.attempt.duration_seconds || 0);
  const totalQuestions = Number(evaluation.totalQuestions || 0);
  const answeredCount = Number(evaluation.answeredCount || 0);
  const correctCount = Number(evaluation.correctCount || 0);
  const totalScore = Number(evaluation.totalScore || 0);
  const maxScore = Number(evaluation.maxScore || 0);
  const parts = (evaluation.partBreakdown || []).map(part => ({
    id: part.id,
    sectionId: part.sectionId,
    title: part.title || '',
    totalQuestions: Number(part.totalQuestions || 0),
    answeredCount: Number(part.answeredCount || 0),
    unansweredCount: Number(part.unansweredCount || 0),
    correctCount: Number(part.correctCount || 0),
    incorrectCount: Number(part.incorrectCount || 0),
    accuracyPercent: percent(part.correctCount, Number(part.totalQuestions || 0)),
  }));
  const sections = (evaluation.sectionResults || []).map(section => ({
    ...section,
    scoreRange: { min: Number(section.scoreRangeMin || 0), max: Number(section.scoreRangeMax || 0) },
    accuracyPercent: percent(section.correctCount, Number(section.totalQuestions || 0)),
    parts: parts.filter(part => part.sectionId === section.sectionId),
  }));
  const rank = Number(meta.rank || 0);
  const totalCandidates = Number(meta.total_candidates || 0);
  const leaderboard = (presentation.leaderboard || []).map((entry, index) => {
    const isCurrentCandidate = entry.attempt_id === attemptId;
    const entryAnswered = Number(entry.answered_count || 0);
    return {
      rank: index + 1,
      displayName: isCurrentCandidate ? 'Bạn' : maskLeaderboardName(entry.full_name),
      score: Number(entry.total_score || 0),
      maxScore: Number(entry.max_score || 0),
      durationSeconds: Number(entry.duration_seconds || 0),
      accuracyPercent: percent(entry.correct_count, entryAnswered),
      isCurrentCandidate,
    };
  });
  const thirdScore = leaderboard.length >= 3 ? leaderboard[2].score : leaderboard.at(-1)?.score;
  return {
    attemptId,
    examId: stored.attempt.exam_id,
    status: stored.attempt.status,
    startedAt: stored.attempt.started_at,
    submittedAt: stored.attempt.submitted_at,
    durationSeconds,
    totalQuestions,
    answeredCount,
    unansweredCount: Number(evaluation.unansweredCount || 0),
    correctCount,
    incorrectCount: Number(evaluation.incorrectCount || 0),
    totalScore,
    maxScore,
    scorePercent: percent(totalScore, maxScore),
    accuracyPercent: percent(correctCount, totalQuestions),
    averageSecondsPerAnswered: answeredCount > 0 ? Math.round((durationSeconds / answeredCount) * 10) / 10 : null,
    scoreRange: { min: Number(evaluation.scoreRangeMin || 0), max: Number(evaluation.scoreRangeMax || 0) },
    sections,
    partBreakdown: parts,
    scoringVersion: evaluation.scoringVersion,
    exam: {
      id: meta.exam_id || stored.attempt.exam_id,
      code: meta.exam_code || null,
      title: meta.exam_title || '',
      examType: meta.exam_type || null,
      allowedDurationSeconds: Number(meta.allowed_duration_seconds || 0),
    },
    candidate: meta.candidate_id ? {
      id: meta.candidate_id,
      candidateNumber: meta.candidate_number || null,
      fullName: meta.full_name || '',
      email: meta.email || null,
      phone: meta.phone || null,
      schoolName: meta.school_name || null,
    } : null,
    ranking: rank > 0 && totalCandidates > 0 ? {
      rank,
      totalCandidates,
      topPercent: Math.max(1, Math.ceil((rank / totalCandidates) * 100)),
    } : null,
    leaderboard: {
      entries: leaderboard,
      pointsToTop3: rank > 3 && thirdScore != null ? Math.max(0, thirdScore - totalScore) : 0,
    },
  };
}

module.exports = { register, start, resume, structure, partQuestions, questionGroup, saveAnswer, submit, result };
