const service = require('../modules/exams/examService');
const mediaService = require('../modules/exams/examMediaService');

// Exam
const list = async (req, res) => res.json({ success: true, ...await service.list(req.query) });
const detail = async (req, res) => res.json({ success: true, data: await service.get(req.params.examId) });
const create = async (req, res) => res.status(201).json({ success: true, data: await service.create(req.body, req.auth?.userId) });
const update = async (req, res) => res.json({ success: true, data: await service.update(req.params.examId, req.body, req.auth?.userId) });
const remove = async (req, res) => { await service.remove(req.params.examId); res.json({ success: true, id: req.params.examId }); };

// Sections
const createSection = async (req, res) => res.status(201).json({ success: true, data: await service.createSection(req.params.examId, req.body) });
const updateSection = async (req, res) => res.json({ success: true, data: await service.updateSection(req.params.examId, req.params.sectionId, req.body) });
const removeSection = async (req, res) => res.json({ success: true, data: await service.deleteSection(req.params.examId, req.params.sectionId) });
const reorderSections = async (req, res) => res.json({ success: true, data: await service.reorderSections(req.params.examId, req.body.sectionIds) });

// Parts
const createPart = async (req, res) => res.status(201).json({ success: true, data: await service.createPart(req.params.examId, req.params.sectionId, req.body) });
const updatePart = async (req, res) => res.json({ success: true, data: await service.updatePart(req.params.examId, req.params.sectionId, req.params.partId, req.body) });
const removePart = async (req, res) => res.json({ success: true, data: await service.deletePart(req.params.examId, req.params.sectionId, req.params.partId) });
const reorderParts = async (req, res) => res.json({ success: true, data: await service.reorderParts(req.params.examId, req.params.sectionId, req.body.partIds) });
const uploadPartAudio = async (req, res) => res.status(201).json({ success: true, data: await mediaService.upload(req.params.examId, req.params.sectionId, req.params.partId, req.file, req.auth?.userId) });
const removePartAudio = async (req, res) => res.json({ success: true, data: await mediaService.remove(req.params.examId, req.params.sectionId, req.params.partId) });

// Questions
const availableQuestions = async (req, res) => res.json({ success: true, ...await service.listEligibleQuestions(req.params.examId, req.params.partId, req.query) });
const addQuestions = async (req, res) => res.status(201).json({ success: true, data: await service.addQuestions(req.params.examId, req.params.sectionId, req.params.partId, req.body.questionIds) });
const removeQuestion = async (req, res) => res.json({ success: true, data: await service.removeQuestion(req.params.examId, req.params.sectionId, req.params.partId, req.params.questionId) });
const reorderQuestions = async (req, res) => res.json({ success: true, data: await service.reorderQuestions(req.params.examId, req.params.sectionId, req.params.partId, req.body.questionIds) });

// Validation + Publish
const validation = async (req, res) => res.json({ success: true, data: await service.validation(req.params.examId) });
const publish = async (req, res) => res.json({ success: true, data: await service.publish(req.params.examId, req.auth?.userId) });
const deactivate = async (req, res) => res.json({ success: true, data: await service.deactivate(req.params.examId, req.auth?.userId) });

module.exports = {
  list, detail, create, update, remove,
  createSection, updateSection, removeSection, reorderSections,
  createPart, updatePart, removePart, reorderParts, uploadPartAudio, removePartAudio,
  availableQuestions, addQuestions, removeQuestion, reorderQuestions,
  validation, publish, deactivate,
};
