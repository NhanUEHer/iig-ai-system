const HttpError = require('../../http/httpError');
const { validateEventId } = require('../exam-events/examEventValidator');
const media = require('../exam-events/examEventMediaService');
const repository = require('./publicExamEventRepository');
const { validateCandidateRegistration } = require('./publicCandidateValidator');
const { signCandidateToken, verifyCandidateToken, signAttemptToken, verifyAttemptToken } = require('./publicCandidateToken');

function resolveAccessState(event, now = new Date()) {
  if (event.status !== 'PUBLISHED') return 'UNAVAILABLE';
  if (new Date(event.startAt).getTime() > now.getTime()) return 'UPCOMING';
  if (new Date(event.endAt).getTime() <= now.getTime()) return 'COMPLETED';
  return 'AVAILABLE';
}

function accessMessage(state) {
  if (state === 'UPCOMING') return 'Kỳ thi chưa đến thời gian bắt đầu.';
  if (state === 'COMPLETED') return 'Kỳ thi đã kết thúc.';
  return null;
}

async function getPublicEvent(eventId, options = {}) {
  validateEventId(eventId);
  const event = await repository.findById(eventId);
  if (!event || event.status !== 'PUBLISHED') {
    throw new HttpError('Kỳ thi không tồn tại hoặc chưa được công bố.', 404, 'PUBLIC_EXAM_EVENT_NOT_FOUND');
  }
  if (event.exam.status !== 'ACTIVE') {
    throw new HttpError('Đề thi hiện không khả dụng.', 409, 'PUBLIC_EXAM_UNAVAILABLE');
  }

  const accessState = resolveAccessState(event, options.now || new Date());
  const { imageStorageKey, bannerStorageKey, status, ...safeEvent } = event;
  const { status: examStatus, ...safeExam } = safeEvent.exam;

  return {
    ...safeEvent,
    exam: safeExam,
    imageUrl: await media.getSignedMediaUrl(imageStorageKey),
    bannerUrl: await media.getSignedMediaUrl(bannerStorageKey),
    accessState,
    canEnter: accessState === 'AVAILABLE',
    unavailableReason: accessMessage(accessState),
  };
}

async function registerCandidate(eventId, input, options = {}) {
  validateEventId(eventId);
  const now = options.now || new Date();
  const data = validateCandidateRegistration(input, now);
  const result = await repository.registerCandidate(eventId, data, now);
  const event = result.context;
  if (!event || event.status !== 'PUBLISHED') {
    throw new HttpError('Kỳ thi không tồn tại hoặc chưa được công bố.', 404, 'PUBLIC_EXAM_EVENT_NOT_FOUND');
  }
  if (event.exam_status !== 'ACTIVE') {
    throw new HttpError('Đề thi hiện không khả dụng.', 409, 'PUBLIC_EXAM_UNAVAILABLE');
  }
  const state = resolveAccessState({ status: event.status, startAt: event.start_at, endAt: event.end_at }, now);
  if (state !== 'AVAILABLE') {
    throw new HttpError(accessMessage(state), 409, `PUBLIC_EXAM_${state}`);
  }
  return {
    candidateId: result.candidate.id,
    candidateToken: signCandidateToken({ candidateId: result.candidate.id, eventId }, event.end_at),
    fullName: result.candidate.full_name,
    schoolName: result.candidate.school_name,
    nextStep: 'EXAM_INTRODUCTION',
  };
}

function requireCandidate(token, eventId) {
  const payload = verifyCandidateToken(token);
  if (payload.eventId !== eventId) throw new HttpError('Phiên đăng ký không thuộc kỳ thi này.', 403, 'CANDIDATE_EVENT_MISMATCH');
  return payload;
}

async function getIntroduction(eventId, token, options = {}) {
  validateEventId(eventId);
  const identity = requireCandidate(token, eventId);
  const [event, candidate] = await Promise.all([
    getPublicEvent(eventId, options),
    repository.findCandidateForEvent(eventId, identity.sub),
  ]);
  if (!candidate) throw new HttpError('Không tìm thấy thông tin đăng ký.', 404, 'CANDIDATE_NOT_FOUND');
  const requiresAudio = event.exam.parts.some(part => /listening|nghe/i.test(`${part.title} ${part.partLabel}`));
  return {
    candidate: { id: candidate.id, fullName: candidate.full_name, schoolName: candidate.school_name },
    event,
    requirements: { requiresAudio },
  };
}

async function startAttempt(eventId, token, input = {}, options = {}) {
  validateEventId(eventId);
  const identity = requireCandidate(token, eventId);
  const intro = await getIntroduction(eventId, token, options);
  if (intro.requirements.requiresAudio && input.audioConfirmed !== true) {
    throw new HttpError('Vui lòng kiểm tra âm thanh trước khi bắt đầu.', 400, 'AUDIO_CHECK_REQUIRED');
  }
  const now = options.now || new Date();
  const result = await repository.startAttempt(eventId, identity.sub, { audioConfirmed: input.audioConfirmed === true, now });
  if (!result.context) throw new HttpError('Không tìm thấy thông tin đăng ký.', 404, 'CANDIDATE_NOT_FOUND');
  if (!result.attempt) throw new HttpError('Kỳ thi hoặc đề thi hiện không khả dụng.', 409, 'PUBLIC_EXAM_UNAVAILABLE');
  const attempt = result.attempt;
  return {
    attemptId: attempt.id,
    attemptToken: signAttemptToken({ candidateId: identity.sub, eventId, attemptId: attempt.id }, attempt.expires_at),
    status: attempt.status,
    startedAt: attempt.started_at,
    expiresAt: attempt.expires_at,
    durationSeconds: Math.max(0, Math.floor((new Date(attempt.expires_at).getTime() - new Date(attempt.started_at).getTime()) / 1000)),
    resumed: result.resumed === true,
    nextStep: 'QUESTION_DELIVERY',
  };
}

function requireAttempt(token, eventId, attemptId) {
  const payload = verifyAttemptToken(token);
  if (payload.eventId !== eventId || payload.attemptId !== attemptId) {
    throw new HttpError('Phiên làm bài không thuộc kỳ thi hoặc lượt thi này.', 403, 'ATTEMPT_SCOPE_MISMATCH');
  }
  return payload;
}

const valueOf = (object, camel, snake) => object?.[camel] ?? object?.[snake] ?? null;

async function signedMedia(mediaRows) {
  return Promise.all(mediaRows.map(async item => ({
    id: item.id,
    type: String(item.media_type || '').toUpperCase(),
    mimeType: item.mime_type || null,
    name: item.original_name || null,
    url: await media.getSignedMediaUrl(item.storage_key),
  })));
}

async function getAttemptQuestions(eventId, attemptId, token, options = {}) {
  validateEventId(eventId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(attemptId || ''))) {
    throw new HttpError('Mã lượt thi không hợp lệ.', 400, 'INVALID_ATTEMPT_ID');
  }
  const identity = requireAttempt(token, eventId, attemptId);
  const delivery = await repository.findAttemptQuestionDelivery(eventId, attemptId, identity.sub);
  if (!delivery) throw new HttpError('Không tìm thấy lượt thi.', 404, 'ATTEMPT_NOT_FOUND');

  const now = options.now || new Date();
  const { attempt } = delivery;
  if (attempt.status !== 'IN_PROGRESS') {
    throw new HttpError('Lượt thi không còn ở trạng thái làm bài.', 409, 'ATTEMPT_NOT_IN_PROGRESS');
  }
  if (new Date(attempt.expires_at).getTime() <= now.getTime()) {
    throw new HttpError('Lượt thi đã hết thời gian.', 409, 'ATTEMPT_EXPIRED');
  }

  const mediaByTarget = new Map();
  for (const row of delivery.media || []) {
    const targetId = row.content_id || row.sub_question_id;
    if (!mediaByTarget.has(targetId)) mediaByTarget.set(targetId, []);
    mediaByTarget.get(targetId).push(row);
  }
  const savedAnswers = new Map((delivery.answers || []).map(answer => [answer.sub_question_id, answer]));

  const snapshot = attempt.question_snapshot || {};
  let number = 0;
  const parts = [];
  for (const [partIndex, part] of (snapshot.parts || []).entries()) {
    const questions = [];
    for (const parent of part.questions || []) {
      const contents = new Map((parent.contents || []).map(content => [content.id, content]));
      const groupFrom = number + 1;
      const groupTo = groupFrom + Math.max(0, (parent.subQuestions || []).length - 1);
      const groupLabel = groupFrom === groupTo ? `Câu hỏi ${groupFrom}` : `Câu hỏi ${groupFrom}–${groupTo}`;
      for (const subQuestion of parent.subQuestions || []) {
        number += 1;
        const contentId = valueOf(subQuestion, 'contentId', 'content_id');
        const content = contents.get(contentId) || null;
        const resolvedMedia = await signedMedia([
          ...(mediaByTarget.get(contentId) || []),
          ...(mediaByTarget.get(subQuestion.id) || []),
        ]);
        const audio = resolvedMedia.find(item => item.type === 'AUDIO') || null;
        const image = resolvedMedia.find(item => item.type === 'IMAGE') || null;
        const video = resolvedMedia.find(item => item.type === 'VIDEO') || null;
        const savedAnswer = savedAnswers.get(subQuestion.id) || null;
        questions.push({
          id: subQuestion.id,
          number,
          parentQuestionId: parent.id,
          group: { from: groupFrom, to: groupTo, label: groupLabel },
          content: content ? {
            id: content.id,
            title: content.title || '',
            html: valueOf(content, 'contentHtml', 'content_html') || '',
            audioUrl: audio?.url || null,
            imageUrl: image?.url || null,
            videoUrl: video?.url || null,
            media: resolvedMedia,
          } : { id: null, title: '', html: '', audioUrl: audio?.url || null, imageUrl: image?.url || null, videoUrl: video?.url || null, media: resolvedMedia },
          promptHtml: valueOf(subQuestion, 'promptHtml', 'prompt_html') || '',
          options: (subQuestion.options || []).map(option => ({
            id: option.id,
            key: valueOf(option, 'optionKey', 'option_key'),
            text: valueOf(option, 'optionText', 'option_text') || '',
          })),
          selectedOption: savedAnswer?.selected_option || null,
          flagged: savedAnswer?.is_flagged === true,
          savedAt: savedAnswer?.updated_at || null,
        });
      }
    }
    parts.push({
      id: part.id,
      type: /listening|nghe/i.test(part.title || '') ? 'LISTENING' : 'READING',
      title: part.title || `Phần ${partIndex + 1}`,
      order: Number(valueOf(part, 'displayOrder', 'display_order') ?? partIndex),
      questions,
    });
  }

  return {
    attempt: {
      id: attempt.id,
      status: attempt.status,
      startedAt: attempt.started_at,
      expiresAt: attempt.expires_at,
      remainingSeconds: Math.max(0, Math.floor((new Date(attempt.expires_at).getTime() - now.getTime()) / 1000)),
    },
    exam: {
      id: snapshot.exam?.id || attempt.exam_id,
      title: snapshot.exam?.title || '',
      totalQuestions: number,
    },
    parts,
  };
}

function findSnapshotSubQuestion(snapshot, subQuestionId) {
  for (const part of snapshot.parts || []) {
    for (const parent of part.questions || []) {
      const subQuestion = (parent.subQuestions || []).find(item => item.id === subQuestionId);
      if (subQuestion) return { parent, subQuestion };
    }
  }
  return null;
}

async function saveAttemptAnswer(eventId, attemptId, subQuestionId, token, input = {}, options = {}) {
  validateEventId(eventId);
  if (!/^[0-9a-f-]{36}$/i.test(String(attemptId || '')) || !/^[0-9a-f-]{36}$/i.test(String(subQuestionId || ''))) {
    throw new HttpError('Mã lượt thi hoặc câu hỏi không hợp lệ.', 400, 'INVALID_ANSWER_TARGET');
  }
  const identity = requireAttempt(token, eventId, attemptId);
  const delivery = await repository.findAttemptQuestionDelivery(eventId, attemptId, identity.sub);
  if (!delivery) throw new HttpError('Không tìm thấy lượt thi.', 404, 'ATTEMPT_NOT_FOUND');
  const now = options.now || new Date();
  if (delivery.attempt.status !== 'IN_PROGRESS') throw new HttpError('Lượt thi không còn ở trạng thái làm bài.', 409, 'ATTEMPT_NOT_IN_PROGRESS');
  if (new Date(delivery.attempt.expires_at).getTime() <= now.getTime()) throw new HttpError('Lượt thi đã hết thời gian.', 409, 'ATTEMPT_EXPIRED');
  const target = findSnapshotSubQuestion(delivery.attempt.question_snapshot || {}, subQuestionId);
  if (!target) throw new HttpError('Câu hỏi không thuộc lượt thi này.', 404, 'SUB_QUESTION_NOT_FOUND');
  const selectedOption = input.selectedOptionKey == null || input.selectedOptionKey === '' ? null : String(input.selectedOptionKey).trim();
  const validOptionKeys = (target.subQuestion.options || []).map(option => valueOf(option, 'optionKey', 'option_key'));
  if (selectedOption && !validOptionKeys.includes(selectedOption)) throw new HttpError('Đáp án được chọn không hợp lệ.', 400, 'INVALID_SELECTED_OPTION');
  const result = await repository.saveAttemptAnswer({
    eventId, attemptId, candidateId: identity.sub, parentQuestionId: target.parent.id,
    subQuestionId, selectedOption, flagged: input.flagged === true, now,
  });
  if (!result.answer) throw new HttpError('Không thể lưu vì lượt thi đã kết thúc.', 409, 'ATTEMPT_NOT_IN_PROGRESS');
  return {
    subQuestionId: result.answer.sub_question_id,
    selectedOptionKey: result.answer.selected_option,
    flagged: result.answer.is_flagged,
    savedAt: result.answer.updated_at,
  };
}

function mcqSummary(snapshot, answers) {
  const answerMap = new Map((answers || []).map(answer => [answer.sub_question_id, answer]));
  const questions = [];
  for (const part of snapshot.parts || []) for (const parent of part.questions || []) for (const sub of parent.subQuestions || []) {
    const options = sub.options || [];
    if (!options.length) continue;
    const answer = answerMap.get(sub.id) || null;
    questions.push({ part, sub, answer, correctKey: valueOf(options.find(option => option.is_correct === true), 'optionKey', 'option_key') });
  }
  const answeredCount = questions.filter(item => item.answer?.selected_option).length;
  return {
    totalQuestions: questions.length,
    answeredCount,
    unansweredCount: questions.length - answeredCount,
    flaggedCount: questions.filter(item => item.answer?.is_flagged === true).length,
    questions,
  };
}

async function getSubmissionSummary(eventId, attemptId, token) {
  validateEventId(eventId);
  const identity = requireAttempt(token, eventId, attemptId);
  const delivery = await repository.findAttemptQuestionDelivery(eventId, attemptId, identity.sub);
  if (!delivery) throw new HttpError('Không tìm thấy lượt thi.', 404, 'ATTEMPT_NOT_FOUND');
  const summary = mcqSummary(delivery.attempt.question_snapshot || {}, delivery.answers || []);
  return { status: delivery.attempt.status, totalQuestions: summary.totalQuestions, answeredCount: summary.answeredCount, unansweredCount: summary.unansweredCount, flaggedCount: summary.flaggedCount };
}

async function submitAttempt(eventId, attemptId, token, options = {}) {
  validateEventId(eventId);
  const identity = requireAttempt(token, eventId, attemptId);
  const now = options.now || new Date();
  const evaluate = (snapshot, answers) => {
    const summary = mcqSummary(snapshot, answers);
    const points = Number(snapshot.exam?.pointsPerSubQuestion || 0);
    const items = summary.questions.map(item => ({ subQuestionId: item.sub.id, partId: item.part.id, partTitle: item.part.title || 'Phần thi', answered: Boolean(item.answer?.selected_option), score: item.answer?.selected_option && item.answer.selected_option === item.correctKey ? points : 0 }));
    const partMap = new Map();
    for (const item of items) {
      const part = partMap.get(item.partId) || { id: item.partId, title: item.partTitle, totalQuestions: 0, answeredCount: 0, correctCount: 0, score: 0, maxScore: 0 };
      part.totalQuestions += 1;part.maxScore += points;part.answeredCount += item.answered ? 1 : 0;part.correctCount += item.score > 0 ? 1 : 0;part.score += item.score;partMap.set(item.partId, part);
    }
    const partBreakdown = [...partMap.values()].map(part => ({ ...part, percent: part.maxScore > 0 ? Math.round((part.score / part.maxScore) * 100) : 0 }));
    return { ...summary, items, partBreakdown, pointsPerQuestion: points, maxScore: summary.totalQuestions * points, totalScore: items.reduce((sum, item) => sum + item.score, 0) };
  };
  const result = await repository.finalizeAttempt({ eventId, attemptId, candidateId: identity.sub, now, evaluate });
  if (!result.attempt) throw new HttpError('Không tìm thấy lượt thi.', 404, 'ATTEMPT_NOT_FOUND');
  if (result.expired) throw new HttpError('Lượt thi không thể nộp ở trạng thái hiện tại.', 409, 'ATTEMPT_NOT_SUBMITTABLE');
  const evaluation = result.evaluation || evaluate(result.attempt.question_snapshot || {}, result.answers || []);
  const maxScore = Number(evaluation.maxScore || 0);
  const correctCount = evaluation.items ? evaluation.items.filter(item => item.score > 0).length : null;
  const toeicCenters = [10,55,95,135,175,220,265,310,355,400,450,505,555,610,660,715,770,825,880,935,990];
  const normalizedCorrect = Math.max(0, Math.min(20, Math.round((Number(correctCount || 0) / Math.max(1, evaluation.totalQuestions)) * 20)));
  const toeicCenter = toeicCenters[normalizedCorrect];
  const ranking = result.ranking ? { rank: Number(result.ranking.rank), totalCandidates: Number(result.ranking.total), topPercent: Math.max(1, Math.ceil((Number(result.ranking.rank) / Number(result.ranking.total)) * 100)) } : null;
  const maskLeaderboardName = fullName => { const words = String(fullName || 'Thí sinh').trim().split(/\s+/);if (words.length < 2) return words[0];return `${words.slice(0,-1).join(' ')} ${words.at(-1).charAt(0)}.`; };
  const leaderboard = (result.leaderboard || []).map((entry, index) => { const isCurrentCandidate=entry.attempt_id===attemptId;return { rank:index+1,displayName:isCurrentCandidate?'Bạn':maskLeaderboardName(entry.full_name),score:Number(entry.total_score||0),durationSeconds:Number(entry.duration_seconds||0),isCurrentCandidate }; });
  const thirdScore = leaderboard.length >= 3 ? leaderboard[2].score : leaderboard.at(-1)?.score;
  return {
    attemptId,
    status: 'SUBMITTED',
    submittedAt: result.attempt.submitted_at,
    totalScore: Number(result.attempt.total_score || evaluation.totalScore || 0),
    maxScore,
    scorePercent: maxScore > 0 ? Math.round((Number(result.attempt.total_score || evaluation.totalScore || 0) / maxScore) * 100) : 0,
    totalQuestions: evaluation.totalQuestions,
    answeredCount: evaluation.answeredCount,
    unansweredCount: evaluation.unansweredCount,
    correctCount,
    partBreakdown: evaluation.partBreakdown || [],
    durationSeconds: result.attempt.started_at && result.attempt.submitted_at ? Math.max(0, Math.round((new Date(result.attempt.submitted_at).getTime() - new Date(result.attempt.started_at).getTime()) / 1000)) : null,
    candidate: result.candidate ? { fullName: result.candidate.full_name, email: result.candidate.email, schoolName: result.candidate.school_name } : null,
    ranking,
    leaderboard: { entries: leaderboard, pointsToTop3: ranking?.rank > 3 && thirdScore != null ? Math.max(0, thirdScore - Number(result.attempt.total_score || evaluation.totalScore || 0)) : 0 },
    toeicEstimate: { min: Math.max(10, toeicCenter - 20), max: Math.min(990, toeicCenter + 20), scale: 990, correctEquivalent: normalizedCorrect },
    resultToken: signAttemptToken({ candidateId: identity.sub, eventId, attemptId }, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)),
    resultTokenExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    alreadySubmitted: result.alreadySubmitted === true,
  };
}

module.exports = { getPublicEvent, registerCandidate, getIntroduction, startAttempt, getAttemptQuestions, saveAttemptAnswer, getSubmissionSummary, submitAttempt, resolveAccessState };
