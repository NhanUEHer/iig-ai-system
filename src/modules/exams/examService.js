const db = require('../../config/db');
const HttpError = require('../../http/httpError');
const repo = require('./examRepository');
const calc = require('./durationCalculator');
const { validateExam, validateListFilters, validateSection, validatePartCreate, validatePartContent } = require('./examValidator');
const { isModeCompatible, modesForExamType, MODE_QUESTION_TYPE, TIMED_MODES, EXAM_ERROR_CODES } = require('./examConstants');
const examDeliveryRepository = require('../public-exams/examDeliveryRepository');
const deliveryCache = require('../public-exam-events/examDeliveryCache');
const scoreScaleRepository = require('../score-scales/scoreScaleRepository');
const storage = require('../../services/storageService');

const LR_MODES = new Set(['NON_STOP', 'FREESTYLE']);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
async function get(id, client) {
  const exam = await repo.findById(id, client);
  if (!exam) throw new HttpError('Không tìm thấy đề thi.', 404, 'EXAM_NOT_FOUND');
  return attachPresentation(exam);
}

async function attachPresentation(exam) {
  if (exam?.cardImage?.storageKey) exam.cardImage.url = await storage.getSignedUrl(exam.cardImage.storageKey).catch(() => null);
  return exam;
}

async function ensureEditable(id, client) {
  const exam = client ? await repo.lockExam(id, client) : await get(id);
  if (!exam) throw new HttpError('Không tìm thấy đề thi.', 404, 'EXAM_NOT_FOUND');
  if (exam.status === 'ACTIVE') throw new HttpError('Hãy ngừng hoạt động đề thi trước khi chỉnh sửa.', 409, 'ACTIVE_EXAM_LOCKED');
  return exam;
}

function assertSameIds(current, next, message) {
  if (!Array.isArray(next) || current.length !== next.length || new Set(next.map(String)).size !== next.length || current.some(id => !next.map(String).includes(String(id)))) {
    throw new HttpError(message, 400, EXAM_ERROR_CODES.INVALID_REORDER);
  }
}

// Attach dynamically computed durations and counts to the exam tree. Nothing is persisted.
async function withComputedDurations(exam) {
  const allQuestionIds = exam.sections.flatMap(s => s.parts.flatMap(p => p.questions.map(q => q.id)));
  const allPartIds = exam.sections.flatMap(s => s.parts.map(p => p.id));
  const durationSources = await repo.loadDurationSources([...new Set(allQuestionIds)]);
  const instructionAudio = await repo.loadInstructionAudioDurations(allPartIds);
  const instructionAudioDetails = await repo.loadInstructionAudioDetails(allPartIds);

  const sectionActuals = [];
  for (const section of exam.sections) {
    let actualSubCount = 0;
    const partDurations = [];
    for (const part of section.parts) {
      const audio = instructionAudioDetails.get(part.id);
      if (audio) {
        part.instructionAudio = {
          id: audio.id,
          mediaType: audio.media_type,
          originalName: audio.original_name,
          mimeType: audio.mime_type,
          fileSize: Number(audio.file_size || 0),
          durationSeconds: Number(audio.duration_seconds || 0),
          url: await storage.getSignedUrl(audio.storage_key).catch(() => null),
        };
      } else {
        part.instructionAudio = null;
      }
      const questionDurations = part.questions.map(q => {
        const duration = calc.questionActualDuration(section.examMode, durationSources.get(q.id) || {});
        q.actualDurationSeconds = duration;
        return duration;
      });
      actualSubCount += part.questions.reduce((sum, q) => sum + Number(q.subQuestionCount || 0), 0);
      const partActual = calc.partActualDuration(section.examMode, {
        instructionAudioSeconds: instructionAudio.get(part.id) || 0,
        questionDurations: questionDurations.map(v => v || 0),
        breakDurationSeconds: part.breakDurationSeconds,
        configuredDurationSeconds: part.configuredDurationSeconds,
      });
      part.actualDurationSeconds = partActual;
      partDurations.push(partActual);
    }
    const sectionActual = calc.sectionActualDuration(section.examMode, partDurations.map(v => v || 0));
    section.actualSubQuestionCount = actualSubCount;
    Object.assign(section, calc.durationComparison(section.configuredDurationSeconds, sectionActual));
    sectionActuals.push(sectionActual);
  }
  exam.examConfiguredDurationSeconds = calc.examConfiguredDuration(exam.sections);
  exam.examActualDurationSeconds = calc.examActualDuration(sectionActuals);
  return exam;
}

async function getWithDurations(id) {
  return withComputedDurations(await get(id));
}

async function list(filters = {}) {
  validateListFilters(filters);
  const result = await repo.list(filters);
  result.data = await Promise.all(result.data.map(attachPresentation));
  return result;
}

// ---------------------------------------------------------------------------
// Exam CRUD
// ---------------------------------------------------------------------------
async function create(data, userId) {
  validateExam(data);
  // Preserve the legacy Draft creation path for internal import/seed clients.
  // Admin creation sends groupIds and uses the atomic metadata assignment below.
  if (data.groupIds === undefined) return attachPresentation(await repo.create(data, userId));
  const exam = await db.transaction(async client => {
    let created = await repo.create(data, userId, client);
    if (data.groupIds !== undefined) {
      if (!await repo.replaceGroups(created.id, data.groupIds, client)) throw new HttpError('Có nhóm đề thi không tồn tại.', 400, 'EXAM_GROUPS_INVALID');
      created = await repo.findById(created.id, client);
    }
    return created;
  });
  return attachPresentation(exam);
}

async function update(id, data, userId) {
  validateExam(data, true);
  if (data.status === 'ACTIVE') throw new HttpError('Hãy dùng thao tác Publish để xuất bản đề.', 400, 'USE_PUBLISH_ENDPOINT');
  await db.transaction(async client => {
    const current = await ensureEditable(id, client);
    // Changing exam type is blocked while any section exists, so no section can
    // be left with an incompatible mode.
    if (data.examType !== undefined && data.examType !== current.examType) {
      if (await repo.countSections(id, client) > 0) {
        throw new HttpError('Không thể đổi kiểu đề khi đề đã có Phần thi. Hãy xóa các Phần thi không tương thích trước.', 409, EXAM_ERROR_CODES.EXAM_TYPE_IMMUTABLE_WITH_SECTIONS);
      }
    }
    await repo.update(id, data, userId, client);
    if (data.groupIds !== undefined && !await repo.replaceGroups(id, data.groupIds, client)) throw new HttpError('Có nhóm đề thi không tồn tại.', 400, 'EXAM_GROUPS_INVALID');
  });
  return getWithDurations(id);
}

async function listGroups() { return repo.listGroups(); }

async function createGroup(data, userId) {
  const name = String(data?.name || '').trim().replace(/\s+/g, ' ');
  if (!name) throw new HttpError('Tên nhóm đề thi là bắt buộc.', 400, 'EXAM_GROUP_NAME_REQUIRED');
  if (name.length > 120) throw new HttpError('Tên nhóm đề thi không được vượt quá 120 ký tự.', 400, 'EXAM_GROUP_NAME_TOO_LONG');
  return repo.createGroup(name, userId);
}

async function remove(id) {
  await db.transaction(async client => {
    const exam = await repo.lockExam(id, client);
    if (!exam) throw new HttpError('Không tìm thấy đề thi.', 404, 'EXAM_NOT_FOUND');
    if (exam.status === 'ACTIVE') throw new HttpError('Không thể xóa đề thi đang hoạt động.', 409, 'ACTIVE_EXAM_DELETE_FORBIDDEN');
    const used = await client.query('SELECT 1 FROM exam_attempts WHERE exam_id=$1 LIMIT 1', [id]);
    if (used.rows[0]) throw new HttpError('Không thể xóa đề thi đã có lượt làm bài.', 409, 'EXAM_HAS_ATTEMPTS');
    await repo.remove(id, client);
  });
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
function assertModeCompatible(examType, examMode) {
  if (!examType) throw new HttpError('Đề thi chưa có kiểu đề hợp lệ.', 400, EXAM_ERROR_CODES.EXAM_TYPE_REQUIRED);
  if (!isModeCompatible(examType, examMode)) {
    throw new HttpError(`Kiểu thi không tương thích với kiểu đề. Cho phép: ${modesForExamType(examType).join(', ') || 'không có'}.`, 400, EXAM_ERROR_CODES.SECTION_MODE_INCOMPATIBLE);
  }
}

async function validateSectionScoreScale({ scoreScaleId, examMode, questionCount }, client) {
  if (!scoreScaleId) return null;
  if (!LR_MODES.has(examMode)) {
    throw new HttpError('Thang điểm theo số câu đúng chỉ áp dụng cho Listening và Reading.', 400, 'SECTION_SCORE_SCALE_MODE_INVALID');
  }
  const scale = await scoreScaleRepository.findById(scoreScaleId, client);
  if (!scale) throw new HttpError('Không tìm thấy thang điểm được chọn.', 404, 'SECTION_SCORE_SCALE_NOT_FOUND');
  if (scale.scaleType !== 'LR_RAW_CORRECT') throw new HttpError('Loại thang điểm không phù hợp với phần thi.', 400, 'SECTION_SCORE_SCALE_TYPE_INVALID');
  if (scale.status !== 'ACTIVE') throw new HttpError('Chỉ có thể gán thang điểm đang hoạt động.', 409, 'SECTION_SCORE_SCALE_NOT_ACTIVE');
  if (scale.questionCount !== Number(questionCount)) {
    throw new HttpError(`Thang điểm có ${scale.questionCount} câu, không khớp với ${Number(questionCount)} câu cấu hình của phần thi.`, 409, 'SECTION_SCORE_SCALE_QUESTION_COUNT_MISMATCH');
  }
  if (scale.rawRanges.length !== scale.questionCount + 1) {
    throw new HttpError('Thang điểm chưa có đầy đủ chi tiết từ 0 đến số câu tối đa.', 409, 'SECTION_SCORE_SCALE_RANGES_INCOMPLETE');
  }
  return scale;
}

async function createSection(examId, data) {
  validateSection(data);
  await db.transaction(async client => {
    const exam = await ensureEditable(examId, client);
    assertModeCompatible(exam.examType, data.examMode);
    await validateSectionScoreScale(data, client);
    await repo.createSection(examId, data, client);
  });
  return getWithDurations(examId);
}

async function ensureSection(examId, sectionId, client = db) {
  const section = await repo.findSection(examId, sectionId, client);
  if (!section) throw new HttpError('Phần thi không thuộc đề thi này.', 404, EXAM_ERROR_CODES.SECTION_NOT_FOUND);
  return section;
}

async function updateSection(examId, sectionId, data) {
  validateSection(data, true);
  await db.transaction(async client => {
    const exam = await ensureEditable(examId, client);
    const section = await ensureSection(examId, sectionId, client);
    const next = {
      examMode: data.examMode === undefined ? section.examMode : data.examMode,
      questionCount: data.questionCount === undefined ? section.questionCount : data.questionCount,
      scoreScaleId: data.scoreScaleId === undefined ? section.scoreScaleId : data.scoreScaleId,
    };
    if (data.examMode !== undefined) assertModeCompatible(exam.examType, data.examMode);
    await validateSectionScoreScale(next, client);
    await repo.updateSection(examId, sectionId, data, client);
  });
  return getWithDurations(examId);
}

async function deleteSection(examId, sectionId) {
  await db.transaction(async client => {
    await ensureEditable(examId, client);
    await ensureSection(examId, sectionId, client);
    const removed = await repo.deleteSection(examId, sectionId, client);
    if (!removed) throw new HttpError('Không thể xóa Phần thi.', 404, EXAM_ERROR_CODES.SECTION_NOT_FOUND);
  });
  return getWithDurations(examId);
}

async function reorderSections(examId, ids) {
  await db.transaction(async client => {
    await ensureEditable(examId, client);
    const current = await repo.listSectionIds(examId, client);
    assertSameIds(current, ids, 'Danh sách Phần thi sắp xếp không hợp lệ.');
    await repo.reorderSections(examId, ids, client);
  });
  return getWithDurations(examId);
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------
async function createPart(examId, sectionId, data) {
  validatePartCreate(data);
  const part = await db.transaction(async client => {
    await ensureEditable(examId, client);
    await ensureSection(examId, sectionId, client);
    return repo.createPart(examId, sectionId, data, client);
  });
  const exam = await getWithDurations(examId);
  return { exam, part };
}

async function ensurePart(examId, sectionId, partId, client = db) {
  const part = await repo.findPart(examId, sectionId, partId, client);
  if (!part) throw new HttpError('Part không thuộc Phần thi này.', 404, EXAM_ERROR_CODES.PART_NOT_FOUND);
  return part;
}

// Validate an instruction-audio media reference: it must exist, be an AUDIO
// file, an MP3, and within the 5MB limit.
async function assertInstructionAudio(mediaId, partId, client = db) {
  const r = await client.query('SELECT media_type,mime_type,file_size,duration_seconds,part_id FROM question_bank_media WHERE id=$1', [mediaId]);
  const media = r.rows[0];
  if (!media) throw new HttpError('Không tìm thấy audio hướng dẫn.', 404, EXAM_ERROR_CODES.PART_AUDIO_INVALID);
  if (media.media_type !== 'AUDIO') throw new HttpError('Audio hướng dẫn phải là tệp âm thanh.', 400, EXAM_ERROR_CODES.PART_AUDIO_INVALID);
  if (media.mime_type && !/mpeg|mp3/i.test(media.mime_type)) throw new HttpError('Audio hướng dẫn phải là định dạng MP3.', 400, EXAM_ERROR_CODES.PART_AUDIO_INVALID);
  if (Number(media.file_size || 0) > 5 * 1024 * 1024) throw new HttpError('Audio hướng dẫn không được vượt quá 5MB.', 400, EXAM_ERROR_CODES.PART_AUDIO_INVALID);
  if (media.part_id !== partId || !(Number(media.duration_seconds) > 0)) throw new HttpError('Audio hướng dẫn không thuộc Part hoặc chưa có metadata thời lượng hợp lệ.', 400, EXAM_ERROR_CODES.PART_AUDIO_INVALID);
}

async function updatePart(examId, sectionId, partId, data) {
  await db.transaction(async client => {
    await ensureEditable(examId, client);
    const section = await ensureSection(examId, sectionId, client);
    await ensurePart(examId, sectionId, partId, client);
    const nextData = section.examMode === 'WRITING_NON_STOP'
      ? { ...data, breakDurationSeconds: 0 }
      : { ...data, configuredDurationSeconds: 0, breakDurationSeconds: TIMED_MODES.has(section.examMode) ? data.breakDurationSeconds : 0 };
    validatePartContent(nextData);
    if (nextData.instructionAudioMediaId) await assertInstructionAudio(nextData.instructionAudioMediaId, partId, client);
    await repo.updatePartContent(examId, sectionId, partId, nextData, client);
  });
  return getWithDurations(examId);
}

async function deletePart(examId, sectionId, partId) {
  await db.transaction(async client => {
    await ensureEditable(examId, client);
    await ensureSection(examId, sectionId, client);
    await ensurePart(examId, sectionId, partId, client);
    await repo.deletePart(examId, sectionId, partId, client);
  });
  return getWithDurations(examId);
}

async function reorderParts(examId, sectionId, ids) {
  await db.transaction(async client => {
    await ensureEditable(examId, client);
    await ensureSection(examId, sectionId, client);
    const current = await repo.listPartIdsInSection(examId, sectionId, client);
    assertSameIds(current, ids, 'Danh sách Part sắp xếp không hợp lệ.');
    await repo.reorderParts(examId, sectionId, ids, client);
  });
  return getWithDurations(examId);
}

// ---------------------------------------------------------------------------
// Eligible questions + relations
// ---------------------------------------------------------------------------
// Eligibility resolves the exam mode from the Part's Section on the server; the
// client never supplies a mode (spec §16).
async function listEligibleQuestions(examId, partId, filters) {
  await get(examId);
  const located = await repo.findPartWithSection(examId, partId);
  if (!located) throw new HttpError('Part không thuộc đề thi này.', 404, EXAM_ERROR_CODES.PART_NOT_FOUND);
  return repo.listEligibleQuestions(examId, located.examMode, filters);
}

async function addQuestions(examId, sectionId, partId, questionIds) {
  if (!Array.isArray(questionIds) || !questionIds.length) throw new HttpError('Vui lòng chọn ít nhất một câu hỏi.', 400, 'QUESTIONS_REQUIRED');
  const unique = [...new Set(questionIds)];
  if (unique.length !== questionIds.length) throw new HttpError('Danh sách câu hỏi bị trùng.', 400, EXAM_ERROR_CODES.DUPLICATE_QUESTIONS);
  return db.transaction(async client => {
    await ensureEditable(examId, client);
    const section = await ensureSection(examId, sectionId, client);
    await ensurePart(examId, sectionId, partId, client);
    // Check "already in the exam" first so the clearer conflict wins over the
    // eligibility rule (which also excludes questions already used).
    const used = await repo.findUsedQuestions(examId, unique, client);
    if (used.length) throw new HttpError('Một hoặc nhiều câu hỏi đã có trong đề thi.', 409, EXAM_ERROR_CODES.QUESTION_ALREADY_ADDED);
    const eligible = await repo.filterEligibleIds(examId, section.examMode, unique, client);
    const notEligible = unique.filter(id => !eligible.has(id));
    if (notEligible.length) throw new HttpError('Một hoặc nhiều câu hỏi không đủ điều kiện cho kiểu thi này.', 400, EXAM_ERROR_CODES.QUESTION_NOT_ELIGIBLE);
    await repo.addQuestions(examId, partId, unique, client);
    return withComputedDurations(await get(examId, client));
  });
}

async function removeQuestion(examId, sectionId, partId, questionId) {
  await db.transaction(async client => {
    await ensureEditable(examId, client);
    await ensureSection(examId, sectionId, client);
    await ensurePart(examId, sectionId, partId, client);
    const removed = await repo.removeQuestion(examId, partId, questionId, client);
    if (!removed.rows[0]) throw new HttpError('Câu hỏi không có trong Part.', 404, 'EXAM_QUESTION_NOT_FOUND');
  });
  return getWithDurations(examId);
}

async function reorderQuestions(examId, sectionId, partId, ids) {
  await db.transaction(async client => {
    await ensureEditable(examId, client);
    await ensureSection(examId, sectionId, client);
    await ensurePart(examId, sectionId, partId, client);
    const current = await repo.listPartQuestionIds(partId, client);
    assertSameIds(current, ids, 'Danh sách câu hỏi sắp xếp không hợp lệ.');
    await repo.reorderQuestions(examId, partId, ids, client);
  });
  return getWithDurations(examId);
}

// ---------------------------------------------------------------------------
// Validation + Publish
// ---------------------------------------------------------------------------
// Full Publish validation (spec §22). Returns errors bound to section/part/
// question identity, plus informational duration warnings.
async function validation(examId) {
  const exam = await withComputedDurations(await get(examId));
  const errors = [];
  const warnings = [];

  if (!exam.title) errors.push({ scope: 'exam', message: 'Đề thi chưa có tên.' });
  if (!exam.examType) errors.push({ scope: 'exam', code: EXAM_ERROR_CODES.EXAM_TYPE_REQUIRED, message: 'Đề thi chưa có kiểu đề.' });
  if (!exam.difficulty) errors.push({ scope: 'exam', code: 'EXAM_DIFFICULTY_REQUIRED', message: 'Đề thi chưa được thiết lập độ khó.' });
  if (!exam.groups?.length) errors.push({ scope: 'exam', code: 'EXAM_GROUP_REQUIRED', message: 'Đề thi phải thuộc ít nhất một nhóm.' });
  if (!exam.cardImage?.storageKey) errors.push({ scope: 'exam', code: 'EXAM_IMAGE_REQUIRED', message: 'Đề thi chưa có ảnh đại diện.' });
  if (!exam.sections.length) errors.push({ scope: 'exam', message: 'Đề thi phải có ít nhất một Phần thi.' });

  const rows = await repo.loadValidationRows(examId);
  const rowsByQuestion = new Map();
  for (const row of rows) {
    if (!rowsByQuestion.has(row.id)) rowsByQuestion.set(row.id, []);
    if (row.sub_id) rowsByQuestion.get(row.id).push(row);
  }

  for (const section of exam.sections) {
    if (exam.examType && !isModeCompatible(exam.examType, section.examMode)) {
      errors.push({ scope: 'section', sectionId: section.id, code: EXAM_ERROR_CODES.SECTION_MODE_INCOMPATIBLE, message: `Phần thi “${section.title}” có kiểu thi không tương thích với kiểu đề.` });
    }
    if (!(section.questionCount > 0)) errors.push({ scope: 'section', sectionId: section.id, message: `Phần thi “${section.title}” phải có số câu cấu hình lớn hơn 0.` });
    if (!(section.configuredDurationSeconds > 0)) errors.push({ scope: 'section', sectionId: section.id, message: `Phần thi “${section.title}” phải có thời gian cấu hình lớn hơn 0.` });
    if (LR_MODES.has(section.examMode)) {
      if (!section.scoreScaleId) {
        errors.push({ scope: 'section', sectionId: section.id, code: 'SECTION_SCORE_SCALE_REQUIRED', message: `Phần thi “${section.title}” chưa được gán thang điểm.` });
      } else if (!section.scoreScale || section.scoreScale.status !== 'ACTIVE') {
        errors.push({ scope: 'section', sectionId: section.id, code: 'SECTION_SCORE_SCALE_NOT_ACTIVE', message: `Thang điểm của phần thi “${section.title}” không còn hoạt động.` });
      } else if (section.scoreScale.scaleType !== 'LR_RAW_CORRECT' || section.scoreScale.questionCount !== section.questionCount || section.scoreScale.rangeCount !== section.questionCount + 1) {
        errors.push({ scope: 'section', sectionId: section.id, code: 'SECTION_SCORE_SCALE_INVALID', message: `Thang điểm của phần thi “${section.title}” không phù hợp hoặc chưa đủ chi tiết.` });
      }
    }
    if (!section.parts.length) errors.push({ scope: 'section', sectionId: section.id, message: `Phần thi “${section.title}” phải có ít nhất một Part.` });
    // Actual child-question count must equal the configured count at Publish.
    if (section.actualSubQuestionCount !== section.questionCount) {
      errors.push({ scope: 'section', sectionId: section.id, message: `Phần thi “${section.title}” có ${section.actualSubQuestionCount} câu hỏi con thực tế, khác số cấu hình ${section.questionCount}.` });
    }
    // Duration difference is informational only.
    if ((TIMED_MODES.has(section.examMode) || section.examMode === 'WRITING_NON_STOP') && section.durationDifferenceSeconds) {
      warnings.push({ scope: 'section', sectionId: section.id, message: `Phần thi “${section.title}” chênh lệch thời gian ${section.durationDifferenceSeconds}s so với cấu hình.` });
    }

    const expectedType = MODE_QUESTION_TYPE[section.examMode];
    for (const part of section.parts) {
      if (!part.title) errors.push({ scope: 'part', sectionId: section.id, partId: part.id, message: 'Có Part chưa có tên.' });
      if (!part.questions.length) errors.push({ scope: 'part', sectionId: section.id, partId: part.id, message: `Part “${part.title}” chưa có câu hỏi.` });
      if (TIMED_MODES.has(section.examMode) && !part.instructionAudio?.id) {
        errors.push({ scope: 'part', sectionId: section.id, partId: part.id, code: 'PART_INSTRUCTION_AUDIO_REQUIRED', message: `Part “${part.title}” phải có audio hướng dẫn.` });
      }
      if (Number(part.breakDurationSeconds) < 0) errors.push({ scope: 'part', sectionId: section.id, partId: part.id, message: `Part “${part.title}” có thời gian nghỉ không hợp lệ.` });
      if (section.examMode === 'WRITING_NON_STOP' && !(Number(part.configuredDurationSeconds) > 0)) {
        errors.push({ scope: 'part', sectionId: section.id, partId: part.id, code: 'PART_DURATION_REQUIRED', message: `Part “${part.title}” phải có thời gian làm bài lớn hơn 0.` });
      }

      const ineligibleIds = await repo.findIneligibleQuestionIds(examId, section.examMode, part.questions.map(q => q.id));
      for (const questionId of ineligibleIds) {
        errors.push({ scope: 'question', sectionId: section.id, partId: part.id, questionId, code: EXAM_ERROR_CODES.QUESTION_NOT_ELIGIBLE, message: 'Câu hỏi không còn đủ điều kiện cho kiểu thi của Phần thi.' });
      }

      for (const q of part.questions) {
        const id = q.id;
        if (q.status !== 'ACTIVE') errors.push({ scope: 'question', sectionId: section.id, partId: part.id, questionId: id, message: `Câu hỏi “${q.questionName}” chưa hoạt động.` });
        if (q.questionType !== expectedType) errors.push({ scope: 'question', sectionId: section.id, partId: part.id, questionId: id, message: `Câu hỏi “${q.questionName}” không đúng dạng cho kiểu thi.` });
        const subs = rowsByQuestion.get(id) || [];
        if (!subs.length) { errors.push({ scope: 'question', sectionId: section.id, partId: part.id, questionId: id, message: `Câu hỏi “${q.questionName}” chưa có câu hỏi con.` }); continue; }
        for (const sub of subs) {
          if (q.questionType === 'MCQ_SINGLE' && (sub.option_count < 2 || sub.correct_count !== 1)) errors.push({ scope: 'question', sectionId: section.id, partId: part.id, questionId: id, message: `Câu hỏi con của “${q.questionName}” phải có ít nhất 2 đáp án và đúng 1 đáp án đúng.` });
          if (q.questionType === 'RECORD' && !(Number(sub.recording_duration_seconds) > 0)) errors.push({ scope: 'question', sectionId: section.id, partId: part.id, questionId: id, message: `Câu hỏi Record “${q.questionName}” thiếu thời gian ghi âm hợp lệ.` });
          if (q.questionType === 'WRITING' && (!(Number(sub.max_character_count) > 0) || sub.min_word_count === null || sub.min_word_count === undefined)) errors.push({ scope: 'question', sectionId: section.id, partId: part.id, questionId: id, message: `Câu hỏi Writing “${q.questionName}” thiếu giới hạn ký tự hoặc số từ tối thiểu.` });
        }
      }
    }
  }

  const summary = {
    sectionCount: exam.sections.length,
    parentQuestionCount: exam.parentQuestionCount,
    subQuestionCount: exam.subQuestionCount,
    totalPoints: exam.subQuestionCount * 10,
  };
  return { valid: errors.length === 0, errors, warnings, summary };
}

async function publish(examId, userId) {
  const checked = await validation(examId);
  if (!checked.valid) throw new HttpError('Đề thi chưa đủ điều kiện Publish.', 400, EXAM_ERROR_CODES.EXAM_NOT_READY, checked.errors);
  const published = await db.transaction(async client => {
    const snapshot = await repo.buildSnapshot(examId, client);
    const versionId = await repo.replacePublishedSnapshot(examId, snapshot, checked.summary, userId, client);
    return { versionId, exam: await get(examId, client) };
  });
  // Warm the public delivery cache after commit; a cache outage must never roll
  // back a successful Publish.
  try {
    const source = await examDeliveryRepository.findVersionQuestionDelivery(published.versionId);
    if (source) {
      await deliveryCache.publishGeneration(examId, source.snapshot, source.media);
    }
  } catch (error) { console.error('[ExamDeliveryCache] Warm after publish failed:', error.message); }
  return withComputedDurations(published.exam);
}

async function deactivate(examId, userId) {
  const exam = await get(examId);
  if (exam.status !== 'ACTIVE') return exam;
  await repo.update(examId, { status: 'INACTIVE' }, userId);
  try { await deliveryCache.clearPublished(examId); }
  catch (error) { console.error('[ExamDeliveryCache] Clear after deactivate failed:', error.message); }
  return getWithDurations(examId);
}

module.exports = {
  list, get: getWithDurations, create, update, remove, listGroups, createGroup,
  createSection, updateSection, deleteSection, reorderSections,
  createPart, updatePart, deletePart, reorderParts,
  listEligibleQuestions, addQuestions, removeQuestion, reorderQuestions,
  validation, publish, deactivate,
};
