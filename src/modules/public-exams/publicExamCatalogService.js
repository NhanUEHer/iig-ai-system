const HttpError = require('../../http/httpError');
const storage = require('../../services/storageService');
const repository = require('./publicExamCatalogRepository');
const examDeliveryRepository = require('./examDeliveryRepository');
const { isValidExamType } = require('../exams/examConstants');

const difficulties = new Set(['BASIC', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const values = input => String(input || '').split(',').map(item => item.trim()).filter(Boolean);

function normalizeFilters(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 12));
  const search = String(query.search || '').trim().slice(0, 120);
  const groupIds = values(query.groupIds || query.groupId);
  const selectedDifficulties = values(query.difficulties || query.difficulty);
  const examTypes = values(query.examTypes || query.examType);
  if (groupIds.some(id => !uuidPattern.test(id))) throw new HttpError('Nhóm đề thi không hợp lệ.', 400, 'PUBLIC_EXAM_GROUP_INVALID');
  if (selectedDifficulties.some(item => !difficulties.has(item))) throw new HttpError('Độ khó không hợp lệ.', 400, 'PUBLIC_EXAM_DIFFICULTY_INVALID');
  if (examTypes.some(item => !isValidExamType(item))) throw new HttpError('Loại đề thi không hợp lệ.', 400, 'PUBLIC_EXAM_TYPE_INVALID');
  return { page, limit, search, groupIds: [...new Set(groupIds)], difficulties: [...new Set(selectedDifficulties)], examTypes: [...new Set(examTypes)] };
}

async function list(query = {}) {
  const filters = normalizeFilters(query);
  const result = await repository.list(filters);
  const data = await Promise.all(result.rows.map(async exam => ({
    ...exam,
    image: {
      url: await storage.getSignedUrl(exam.image.storageKey).catch(() => null),
      mimeType: exam.image.mimeType,
      fileSize: exam.image.fileSize,
    },
  })));
  return {
    data,
    meta: {
      page: filters.page,
      limit: filters.limit,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / filters.limit)),
    },
  };
}

async function listGroups() { return repository.listGroups(); }

async function detail(examId) {
  if (!uuidPattern.test(String(examId || ''))) throw new HttpError('Đề thi không hợp lệ.', 400, 'PUBLIC_EXAM_ID_INVALID');
  const deliveryCache = require('../public-exam-events/examDeliveryCache');
  let [manifestResult, structureResult] = await Promise.all([
    deliveryCache.readPublished(examId, 'manifest'),
    deliveryCache.readPublished(examId, 'structure'),
  ]);
  if (!manifestResult?.payload || !structureResult?.payload) {
    const source = await examDeliveryRepository.findCurrentExamQuestionDelivery(examId);
    if (source?.snapshot) {
      const generated = await deliveryCache.publishGeneration(examId, source.snapshot, source.media);
      manifestResult = { payload: generated.bundle.manifest };
      structureResult = { payload: generated.bundle.structure };
    }
  }
  if (!manifestResult?.payload || !structureResult?.payload) {
    throw new HttpError('Đề thi chưa được publish hoặc dữ liệu phát hành không còn khả dụng.', 404, 'PUBLIC_EXAM_NOT_PUBLISHED');
  }
  const exam = manifestResult.payload.exam || {};
  const imageUrl = exam.cardImageStorageKey
    ? await storage.getSignedUrl(exam.cardImageStorageKey).catch(() => null)
    : null;
  return {
    id: exam.id,
    code: exam.code || null,
    title: exam.title || '',
    examType: exam.examType || null,
    description: exam.description || '',
    introductionHtml: exam.introductionHtml || '',
    label: exam.displayLabel || '',
    difficulty: exam.difficulty || null,
    groups: Array.isArray(exam.groups) ? exam.groups : [],
    image: { url: imageUrl },
    sectionCount: Number(exam.totalSections || 0),
    partCount: Number(exam.totalParts || 0),
    questionCount: Number(exam.totalQuestions || 0),
    durationSeconds: Number(exam.totalDurationSeconds || 0),
    sections: (structureResult.payload.sections || []).map(section => ({
      id: section.id,
      title: section.title || '',
      examMode: section.examMode || null,
      questionCount: Number(section.questionCount || 0),
      durationSeconds: Number(section.configuredDurationSeconds || 0),
      sortOrder: Number(section.sortOrder || 0),
      parts: (section.parts || []).map(part => ({
        id: part.id,
        title: part.title || '',
        questionCount: Number(part.questionCount || 0),
        durationSeconds: Number(part.configuredDurationSeconds || 0),
        sortOrder: Number(part.sortOrder || 0),
        instructionHtml: part.instructionHtml || '',
        instructionAudio: part.instructionAudio || null,
        breakDurationSeconds: Number(part.breakDurationSeconds || 0),
      })),
    })),
  };
}

module.exports = { list, detail, listGroups, normalizeFilters };
