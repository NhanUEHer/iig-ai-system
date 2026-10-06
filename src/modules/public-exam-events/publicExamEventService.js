const HttpError = require('../../http/httpError');
const { validateEventId } = require('../exam-events/examEventValidator');
const media = require('../exam-events/examEventMediaService');
const repository = require('./publicExamEventRepository');
const { validateCandidateRegistration } = require('./publicCandidateValidator');
const { signCandidateToken, verifyCandidateToken, signAttemptToken, verifyAttemptToken } = require('./publicCandidateToken');
const deliveryCache = require('./examDeliveryCache');
const answerStore = require('./attemptAnswerStore');
const recordingRepository = require('./attemptRecordingRepository');
const storage = require('../../services/storageService');
const crypto = require('crypto');

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
  await answerStore.writeMeta({
    ...attempt,
    eventId,
    candidateId: identity.sub,
    examId: result.context.exam_id,
    versionId: result.context.active_version_id,
  });
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

async function attemptSnapshot(eventId, attemptId, candidateId) {
  const source = await repository.findAttemptQuestionDelivery(eventId, attemptId, candidateId);
  if (!source) throw new HttpError('Không tìm thấy lượt thi.', 404, 'ATTEMPT_NOT_FOUND');
  return source;
}

async function attemptGrading(eventId, attemptId, candidateId) {
  return deliveryCache.getGradingOrBuild(`attempt:${attemptId}`, async () => (await attemptSnapshot(eventId, attemptId, candidateId)).snapshot);
}

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
  let attempt = await answerStore.readMeta(attemptId);
  let legacyAnswers = [];
  if (!attempt) {
    const delivery = await repository.findAttemptQuestionState(eventId, attemptId, identity.sub);
    if (!delivery) throw new HttpError('Không tìm thấy lượt thi.', 404, 'ATTEMPT_NOT_FOUND');
    attempt = delivery.attempt;
    legacyAnswers = delivery.answers || [];
    await answerStore.writeMeta({ ...attempt, eventId, candidateId: identity.sub });
    await Promise.all(legacyAnswers.map(answer => answerStore.save(attemptId, answer.sub_question_id, {
      selectedOptionKey: answer.selected_option, flagged: answer.is_flagged, savedAt: answer.updated_at,
    }, attempt.expires_at)));
  }
  if ((attempt.eventId || attempt.exam_event_id) !== eventId || (attempt.candidateId || attempt.candidate_id) !== identity.sub) {
    throw new HttpError('Không tìm thấy lượt thi.', 404, 'ATTEMPT_NOT_FOUND');
  }

  const now = options.now || new Date();
  const attemptExpiresAt = attempt.expiresAt || attempt.expires_at;
  const attemptStartedAt = attempt.startedAt || attempt.started_at;
  if (attempt.status !== 'IN_PROGRESS') {
    throw new HttpError('Lượt thi không còn ở trạng thái làm bài.', 409, 'ATTEMPT_NOT_IN_PROGRESS');
  }
  if (new Date(attemptExpiresAt).getTime() <= now.getTime()) {
    throw new HttpError('Lượt thi đã hết thời gian.', 409, 'ATTEMPT_EXPIRED');
  }

  const redisAnswers = await answerStore.readAll(attemptId);
  const storedAnswers = redisAnswers?.length ? redisAnswers : legacyAnswers.map(answer => ({
    subQuestionId: answer.sub_question_id, selectedOptionKey: answer.selected_option,
    flagged: answer.is_flagged, savedAt: answer.updated_at,
  }));
  const savedAnswers = new Map(storedAnswers.map(answer => [answer.subQuestionId, answer]));
  const cached = await deliveryCache.getOrBuild(`attempt:${attemptId}`, async () => {
    const source = await attemptSnapshot(eventId, attemptId, identity.sub);
    return deliveryCache.build(source.snapshot, source.media);
  });
  const hasRecordQuestions = cached.payload.parts.some(part => part.questions.some(question => question.questionType === 'RECORD'));
  const recordings = hasRecordQuestions ? await recordingRepository.activeByAttempt(attemptId) : [];
  const recordingByQuestion = new Map(recordings.map(recording => [recording.subQuestionId, recording]));
  const parts = cached.payload.parts.map(part => ({ ...part, questions: part.questions.map(question => {
    const savedAnswer = savedAnswers.get(question.id) || null;
    const recording = recordingByQuestion.get(question.id) || null;
    return { ...question, selectedOption: savedAnswer?.selectedOptionKey || null, flagged: savedAnswer?.flagged === true, savedAt: savedAnswer?.savedAt || null,
      recording: recording ? { id: recording.id, status: recording.status, durationSeconds: recording.durationSeconds,
        mimeType: recording.mimeType, fileSize: recording.fileSize, attemptNumber: recording.attemptNumber, uploadedAt: recording.uploadedAt } : null };
  }) }));

  return {
    attempt: {
      id: attempt.id,
      status: attempt.status,
      startedAt: attemptStartedAt,
      expiresAt: attemptExpiresAt,
      remainingSeconds: Math.max(0, Math.floor((new Date(attemptExpiresAt).getTime() - now.getTime()) / 1000)),
    },
    exam: {
      id: cached.payload.exam.id || attempt.examId || attempt.exam_id,
      title: cached.payload.exam.title || '',
      totalQuestions: cached.payload.exam.totalQuestions,
    },
    sections: cached.payload.sections || [],
    parts,
    cache: cached.cache,
  };
}

async function stagedAttemptPiece(eventId, attemptId, token, type, id, options = {}) {
  validateEventId(eventId);
  const identity = requireAttempt(token, eventId, attemptId);
  const state = await repository.findAttemptQuestionState(eventId, attemptId, identity.sub);
  if (!state) throw new HttpError('Không tìm thấy lượt thi.', 404, 'ATTEMPT_NOT_FOUND');
  const now = options.now || new Date();
  if (state.attempt.status !== 'IN_PROGRESS') throw new HttpError('Lượt thi không còn ở trạng thái làm bài.', 409, 'ATTEMPT_NOT_IN_PROGRESS');
  if (new Date(state.attempt.expires_at).getTime() <= now.getTime()) throw new HttpError('Lượt thi đã hết thời gian.', 409, 'ATTEMPT_EXPIRED');
  const cached = await deliveryCache.getAttemptPieceOrBuild(attemptId, type, id, async () => {
    const source = await attemptSnapshot(eventId, attemptId, identity.sub);
    return deliveryCache.buildDeliveryBundle(source.snapshot, source.media);
  });
  if (!cached.payload) {
    const code = type === 'partQuestions' ? 'ATTEMPT_PART_NOT_FOUND' : 'ATTEMPT_QUESTION_NOT_FOUND';
    throw new HttpError(type === 'partQuestions' ? 'Part không thuộc lượt thi này.' : 'Câu hỏi không thuộc lượt thi này.', 404, code);
  }
  return {
    attempt: {
      id: state.attempt.id,
      status: state.attempt.status,
      startedAt: state.attempt.started_at,
      expiresAt: state.attempt.expires_at,
      remainingSeconds: Math.max(0, Math.floor((new Date(state.attempt.expires_at).getTime() - now.getTime()) / 1000)),
    },
    payload: cached.payload,
    cache: cached.cache,
  };
}

async function getAttemptManifest(eventId, attemptId, token, options = {}) {
  const result = await stagedAttemptPiece(eventId, attemptId, token, 'manifest', null, options);
  return {
    attempt: result.attempt,
    ...result.payload,
    cache: result.cache,
  };
}

async function getAttemptStructure(eventId, attemptId, token, options = {}) {
  const result = await stagedAttemptPiece(eventId, attemptId, token, 'structure', null, options);
  return {
    attempt: result.attempt,
    ...result.payload,
    cache: result.cache,
  };
}

async function getAttemptPartQuestions(eventId, attemptId, partId, token, options = {}) {
  const result = await stagedAttemptPiece(eventId, attemptId, token, 'partQuestions', partId, options);
  const answers = await answerStore.readAll(attemptId) || [];
  const answerByQuestion = new Map((answers || []).map(answer => [answer.subQuestionId, answer]));
  return {
    attempt: result.attempt,
    ...result.payload,
    questions: result.payload.questions.map(question => ({
      ...question,
      answered: Boolean(answerByQuestion.get(question.id)?.selectedOptionKey),
      flagged: answerByQuestion.get(question.id)?.flagged === true,
    })),
    cache: result.cache,
  };
}

async function getAttemptQuestion(eventId, attemptId, subQuestionId, token, options = {}) {
  const result = await stagedAttemptPiece(eventId, attemptId, token, 'question', subQuestionId, options);
  const saved = (await answerStore.readAll(attemptId) || []).find(answer => answer.subQuestionId === subQuestionId);
  return {
    attempt: result.attempt,
    examId: result.payload.examId,
    sectionId: result.payload.sectionId,
    partId: result.payload.partId,
    question: { ...result.payload, selectedOption: saved?.selectedOptionKey || null, flagged: saved?.flagged === true, savedAt: saved?.savedAt || null },
    cache: result.cache,
  };
}

async function recordingContext(eventId, attemptId, subQuestionId, token, options = {}) {
  validateEventId(eventId);
  const identity = requireAttempt(token, eventId, attemptId);
  const attempt = await repository.findAttemptState(eventId, attemptId, identity.sub);
  if (!attempt) throw new HttpError('Không tìm thấy lượt thi.', 404, 'ATTEMPT_NOT_FOUND');
  const now = options.now || new Date();
  if (attempt.status !== 'IN_PROGRESS') throw new HttpError('Lượt thi không còn ở trạng thái làm bài.', 409, 'ATTEMPT_NOT_IN_PROGRESS');
  if (new Date(attempt.expires_at).getTime() <= now.getTime()) throw new HttpError('Lượt thi đã hết thời gian.', 409, 'ATTEMPT_EXPIRED');
  const grading = await attemptGrading(eventId, attemptId, identity.sub);
  const target = grading.questions[subQuestionId];
  if (!target || target.questionType !== 'RECORD') throw new HttpError('Câu hỏi Record không hợp lệ.', 404, 'RECORD_QUESTION_NOT_FOUND');
  return { identity, attempt, target, now };
}

const RECORDING_MIME_TYPES = new Set(['audio/webm','audio/webm;codecs=opus','audio/mp4','audio/ogg','audio/ogg;codecs=opus']);
const mimeExtension = mimeType => mimeType.startsWith('audio/mp4') ? 'm4a' : mimeType.startsWith('audio/ogg') ? 'ogg' : 'webm';

async function createRecordingUpload(eventId, attemptId, subQuestionId, token, input = {}) {
  const { target } = await recordingContext(eventId, attemptId, subQuestionId, token);
  const mimeType = String(input.mimeType || '').toLowerCase();
  if (!RECORDING_MIME_TYPES.has(mimeType)) throw new HttpError('Định dạng audio không được hỗ trợ.', 400, 'RECORDING_MIME_UNSUPPORTED');
  if (!storage.isR2Configured()) throw new HttpError('Kho lưu trữ audio chưa được cấu hình.', 503, 'RECORDING_STORAGE_UNAVAILABLE');
  const id = crypto.randomUUID();
  const key = `exam-recordings/${attemptId}/${subQuestionId}/${id}.${mimeExtension(mimeType)}`;
  const recording = await recordingRepository.createPending({ attemptId, questionId: target.parentQuestionId, subQuestionId, storageKey: `r2:${key}`, mimeType });
  const uploadUrl = await storage.createSignedUploadUrl(key, mimeType, 900);
  return { recordingId: recording.id, uploadUrl, storageKey: recording.storageKey, expiresInSeconds: 900, attemptNumber: recording.attemptNumber };
}

async function finalizeRecording(eventId, attemptId, subQuestionId, recordingId, token, input = {}) {
  const { target, now } = await recordingContext(eventId, attemptId, subQuestionId, token);
  const pending = await recordingRepository.findOwned(recordingId, attemptId, subQuestionId);
  if (!pending || !['PENDING','UPLOADED'].includes(pending.status)) throw new HttpError('Không tìm thấy bản thu đang tải.', 404, 'RECORDING_NOT_FOUND');
  let object;
  try { object = await storage.headObject(pending.storageKey); }
  catch { throw new HttpError('Audio chưa được tải lên hoàn tất.', 409, 'RECORDING_UPLOAD_INCOMPLETE'); }
  const fileSize = Number(object.size || input.fileSize || 0);
  const durationSeconds = Number(input.durationSeconds || 0);
  const maxDuration = Number(target.recordingDurationSeconds || 0);
  if (!fileSize || fileSize > 25 * 1024 * 1024) throw new HttpError('Kích thước bản thu không hợp lệ.', 400, 'RECORDING_SIZE_INVALID');
  if (!(durationSeconds > 0) || (maxDuration > 0 && durationSeconds > maxDuration + 2)) throw new HttpError('Thời lượng bản thu không hợp lệ.', 400, 'RECORDING_DURATION_INVALID');
  const activated = await recordingRepository.activate({ id: recordingId, attemptId, subQuestionId, fileSize,
    durationSeconds, checksum: input.checksum, mimeType: object.contentType || pending.mimeType, now });
  for (const oldKey of activated?.replacedStorageKeys || []) storage.deleteFile(oldKey).catch(error => console.warn('[Recording] Cannot delete replaced object:', error.message));
  return { ...activated.recording, playbackUrl: await storage.getSignedUrl(activated.recording.storageKey) };
}

async function getRecording(eventId, attemptId, subQuestionId, token) {
  await recordingContext(eventId, attemptId, subQuestionId, token);
  const recording = await recordingRepository.findActive(attemptId, subQuestionId);
  if (!recording) return null;
  return { ...recording, playbackUrl: await storage.getSignedUrl(recording.storageKey) };
}

async function deleteRecording(eventId, attemptId, subQuestionId, recordingId, token) {
  const { now } = await recordingContext(eventId, attemptId, subQuestionId, token);
  const recording = await recordingRepository.softDelete(recordingId, attemptId, subQuestionId, now);
  if (!recording) throw new HttpError('Không tìm thấy bản thu để xóa.', 404, 'RECORDING_NOT_FOUND');
  try { await storage.deleteFile(recording.storageKey); }
  catch (error) { console.warn('[Recording] Cannot delete object:', error.message); }
  return { id: recording.id, deleted: true };
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
  const now = options.now || new Date();
  let attempt = await answerStore.readMeta(attemptId);
  if (!attempt) {
    const row = await repository.findAttemptState(eventId, attemptId, identity.sub);
    if (!row) throw new HttpError('Không tìm thấy lượt thi.', 404, 'ATTEMPT_NOT_FOUND');
    attempt = { id: row.id, eventId, candidateId: identity.sub, examId: row.exam_id, versionId: row.exam_version_id, status: row.status, startedAt: row.started_at, expiresAt: row.expires_at };
    await answerStore.writeMeta(attempt);
  }
  if (attempt.eventId !== eventId || attempt.candidateId !== identity.sub) throw new HttpError('Không tìm thấy lượt thi.', 404, 'ATTEMPT_NOT_FOUND');
  if (attempt.status !== 'IN_PROGRESS') throw new HttpError('Lượt thi không còn ở trạng thái làm bài.', 409, 'ATTEMPT_NOT_IN_PROGRESS');
  if (new Date(attempt.expiresAt).getTime() <= now.getTime()) throw new HttpError('Lượt thi đã hết thời gian.', 409, 'ATTEMPT_EXPIRED');
  const grading = await attemptGrading(eventId, attemptId, identity.sub);
  const target = grading.questions[subQuestionId];
  if (!target) throw new HttpError('Câu hỏi không thuộc lượt thi này.', 404, 'SUB_QUESTION_NOT_FOUND');
  const selectedOption = input.selectedOptionKey == null || input.selectedOptionKey === '' ? null : String(input.selectedOptionKey).trim();
  if (selectedOption && !target.optionKeys.includes(selectedOption)) throw new HttpError('Đáp án được chọn không hợp lệ.', 400, 'INVALID_SELECTED_OPTION');
  const answer = { selectedOptionKey: selectedOption, flagged: input.flagged === true, savedAt: now.toISOString() };
  const cached = await answerStore.save(attemptId, subQuestionId, answer, attempt.expiresAt);
  if (!cached) {
    const result = await repository.saveAttemptAnswer({ eventId, attemptId, candidateId: identity.sub,
      parentQuestionId: target.parentQuestionId, subQuestionId, selectedOption, flagged: answer.flagged, now });
    if (!result.answer) throw new HttpError('Không thể lưu vì lượt thi đã kết thúc.', 409, 'ATTEMPT_NOT_IN_PROGRESS');
  }
  return {
    subQuestionId, selectedOptionKey: selectedOption, flagged: answer.flagged, savedAt: answer.savedAt,
    storage: cached ? 'REDIS' : 'POSTGRESQL_FALLBACK',
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
  let attempt = await answerStore.readMeta(attemptId);
  if (!attempt) {
    const row = await repository.findAttemptState(eventId, attemptId, identity.sub);
    if (!row) throw new HttpError('Không tìm thấy lượt thi.', 404, 'ATTEMPT_NOT_FOUND');
    attempt = { id: row.id, eventId, candidateId: identity.sub, versionId: row.exam_version_id, status: row.status, expiresAt: row.expires_at };
    await answerStore.writeMeta(attempt);
  }
  const grading = await attemptGrading(eventId, attemptId, identity.sub);
  const answers = await answerStore.readAll(attemptId) || [];
  const hasRecordQuestions = Object.values(grading.questions).some(question => question.questionType === 'RECORD');
  const recordings = hasRecordQuestions ? await recordingRepository.activeByAttempt(attemptId) : [];
  const answeredIds = new Set(answers.filter(answer => answer.selectedOptionKey).map(answer => answer.subQuestionId));
  recordings.forEach(recording => answeredIds.add(recording.subQuestionId));
  const answeredCount = answeredIds.size;
  return { status: attempt.status, totalQuestions: Object.keys(grading.questions).length, answeredCount,
    unansweredCount: Object.keys(grading.questions).length - answeredCount, flaggedCount: answers.filter(answer => answer.flagged).length };
}

async function submitAttempt(eventId, attemptId, token, options = {}) {
  validateEventId(eventId);
  const identity = requireAttempt(token, eventId, attemptId);
  const now = options.now || new Date();
  let attemptMeta = await answerStore.readMeta(attemptId);
  if (!attemptMeta) {
    const row = await repository.findAttemptState(eventId, attemptId, identity.sub);
    if (!row) throw new HttpError('Không tìm thấy lượt thi.', 404, 'ATTEMPT_NOT_FOUND');
    attemptMeta = { id: row.id, eventId, candidateId: identity.sub, versionId: row.exam_version_id, status: row.status, startedAt: row.started_at, expiresAt: row.expires_at };
  }
  const grading = await attemptGrading(eventId, attemptId, identity.sub);
  const redisAnswers = await answerStore.readAll(attemptId) || [];
  const submittedAnswers = Array.isArray(options.answers) ? options.answers : [];
  const merged = new Map(redisAnswers.map(answer => [answer.subQuestionId, answer]));
  for (const answer of submittedAnswers) if (grading.questions[answer.subQuestionId]) merged.set(answer.subQuestionId, {
    subQuestionId: answer.subQuestionId,
    selectedOptionKey: answer.selectedOptionKey || null,
    flagged: answer.flagged === true,
    savedAt: answer.savedAt || now.toISOString(),
  });
  const answers = [...merged.values()].filter(answer => grading.questions[answer.subQuestionId]
    && (!answer.selectedOptionKey || grading.questions[answer.subQuestionId].optionKeys.includes(answer.selectedOptionKey)));
  const hasRecordQuestions = Object.values(grading.questions).some(question => question.questionType === 'RECORD');
  const activeRecordings = hasRecordQuestions ? await recordingRepository.activeByAttempt(attemptId) : [];
  const recordingIds = new Set(activeRecordings.map(recording => recording.subQuestionId));
  const evaluate = currentAnswers => {
    const answerMap = new Map(currentAnswers.map(answer => [answer.subQuestionId, answer]));
    const items = Object.values(grading.questions).map(question => {
      const answer = answerMap.get(question.subQuestionId);
      return { ...question, selectedOption: answer?.selectedOptionKey || null, flagged: answer?.flagged === true,
        savedAt: answer?.savedAt || now, answered: Boolean(answer?.selectedOptionKey)||recordingIds.has(question.subQuestionId),
        score: answer?.selectedOptionKey && answer.selectedOptionKey === question.correctOptionKey ? question.points : 0 };
    });
    const points = Number(grading.exam?.pointsPerSubQuestion || items[0]?.points || 0);
    const partMap = new Map();
    for (const item of items) {
      const part = partMap.get(item.partId) || { id: item.partId, title: item.partTitle, totalQuestions: 0, answeredCount: 0, correctCount: 0, score: 0, maxScore: 0 };
      part.totalQuestions += 1;part.maxScore += points;part.answeredCount += item.answered ? 1 : 0;part.correctCount += item.score > 0 ? 1 : 0;part.score += item.score;partMap.set(item.partId, part);
    }
    const partBreakdown = [...partMap.values()].map(part => ({ ...part, percent: part.maxScore > 0 ? Math.round((part.score / part.maxScore) * 100) : 0 }));
    const answeredCount = items.filter(item => item.answered).length;
    return { totalQuestions: items.length, answeredCount, unansweredCount: items.length - answeredCount,
      flaggedCount: items.filter(item => item.flagged).length, items, partBreakdown,
      pointsPerQuestion: points, maxScore: items.length * points, totalScore: items.reduce((sum, item) => sum + item.score, 0) };
  };
  const evaluation = evaluate(answers);
  const result = await repository.finalizeAttempt({ eventId, attemptId, candidateId: identity.sub, now, answers, evaluation });
  if (!result.attempt) throw new HttpError('Không tìm thấy lượt thi.', 404, 'ATTEMPT_NOT_FOUND');
  if (result.expired) throw new HttpError('Lượt thi không thể nộp ở trạng thái hiện tại.', 409, 'ATTEMPT_NOT_SUBMITTABLE');
  const finalEvaluation = result.evaluation || evaluation;
  const resultMeta = await repository.getAttemptResultMeta(eventId, attemptId, identity.sub);
  await answerStore.markSubmitted(attemptId);
  const maxScore = Number(finalEvaluation.maxScore || 0);
  const correctCount = finalEvaluation.items ? finalEvaluation.items.filter(item => item.score > 0).length : null;
  const toeicCenters = [10,55,95,135,175,220,265,310,355,400,450,505,555,610,660,715,770,825,880,935,990];
  const normalizedCorrect = Math.max(0, Math.min(20, Math.round((Number(correctCount || 0) / Math.max(1, evaluation.totalQuestions)) * 20)));
  const toeicCenter = toeicCenters[normalizedCorrect];
  const ranking = resultMeta.ranking ? { rank: Number(resultMeta.ranking.rank), totalCandidates: Number(resultMeta.ranking.total), topPercent: Math.max(1, Math.ceil((Number(resultMeta.ranking.rank) / Number(resultMeta.ranking.total)) * 100)) } : null;
  const maskLeaderboardName = fullName => { const words = String(fullName || 'Thí sinh').trim().split(/\s+/);if (words.length < 2) return words[0];return `${words.slice(0,-1).join(' ')} ${words.at(-1).charAt(0)}.`; };
  const leaderboard = (resultMeta.leaderboard || []).map((entry, index) => { const isCurrentCandidate=entry.attempt_id===attemptId;return { rank:index+1,displayName:isCurrentCandidate?'Bạn':maskLeaderboardName(entry.full_name),score:Number(entry.total_score||0),durationSeconds:Number(entry.duration_seconds||0),isCurrentCandidate }; });
  const thirdScore = leaderboard.length >= 3 ? leaderboard[2].score : leaderboard.at(-1)?.score;
  return {
    attemptId,
    status: 'SUBMITTED',
    submittedAt: result.attempt.submitted_at,
    totalScore: Number(result.attempt.total_score || evaluation.totalScore || 0),
    maxScore,
    scorePercent: maxScore > 0 ? Math.round((Number(result.attempt.total_score || evaluation.totalScore || 0) / maxScore) * 100) : 0,
    totalQuestions: finalEvaluation.totalQuestions,
    answeredCount: finalEvaluation.answeredCount,
    unansweredCount: finalEvaluation.unansweredCount,
    correctCount,
    partBreakdown: finalEvaluation.partBreakdown || [],
    durationSeconds: result.attempt.started_at && result.attempt.submitted_at ? Math.max(0, Math.round((new Date(result.attempt.submitted_at).getTime() - new Date(result.attempt.started_at).getTime()) / 1000)) : null,
    candidate: resultMeta.candidate ? { fullName: resultMeta.candidate.full_name, email: resultMeta.candidate.email, schoolName: resultMeta.candidate.school_name } : null,
    ranking,
    leaderboard: { entries: leaderboard, pointsToTop3: ranking?.rank > 3 && thirdScore != null ? Math.max(0, thirdScore - Number(result.attempt.total_score || evaluation.totalScore || 0)) : 0 },
    toeicEstimate: { min: Math.max(10, toeicCenter - 20), max: Math.min(990, toeicCenter + 20), scale: 990, correctEquivalent: normalizedCorrect },
    resultToken: signAttemptToken({ candidateId: identity.sub, eventId, attemptId }, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)),
    resultTokenExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    alreadySubmitted: result.alreadySubmitted === true,
  };
}

module.exports = { getPublicEvent, registerCandidate, getIntroduction, startAttempt, getAttemptQuestions,
  getAttemptManifest, getAttemptStructure, getAttemptPartQuestions, getAttemptQuestion, saveAttemptAnswer,
  createRecordingUpload, finalizeRecording, getRecording, deleteRecording,
  getSubmissionSummary, submitAttempt, resolveAccessState };
