const express = require('express');
const asyncHandler = require('../http/asyncHandler');
const { requirePermission } = require('../middleware/authenticate');
const c = require('../controllers/examV3Controller');
const multer = require('multer');
const r = express.Router();
const uploadPartAudio = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('file');
const uploadCardImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('file');

// Exam list + create
r.get('/groups', requirePermission('exams.view'), asyncHandler(c.listGroups));
r.post('/groups', requirePermission('exams.manage'), asyncHandler(c.createGroup));
r.get('/', requirePermission('exams.view'), asyncHandler(c.list));
r.post('/', requirePermission('exams.manage'), asyncHandler(c.create));

r.post('/:examId/card-image', requirePermission('exams.manage'), uploadCardImage, asyncHandler(c.uploadCardImage));
r.delete('/:examId/card-image', requirePermission('exams.manage'), asyncHandler(c.removeCardImage));

// Section-nested routes (registered before the dynamic /:examId detail route).
r.post('/:examId/sections', requirePermission('exams.manage'), asyncHandler(c.createSection));
r.put('/:examId/sections/reorder', requirePermission('exams.manage'), asyncHandler(c.reorderSections));
r.put('/:examId/sections/:sectionId', requirePermission('exams.manage'), asyncHandler(c.updateSection));
r.delete('/:examId/sections/:sectionId', requirePermission('exams.manage'), asyncHandler(c.removeSection));

r.post('/:examId/sections/:sectionId/parts', requirePermission('exams.manage'), asyncHandler(c.createPart));
r.put('/:examId/sections/:sectionId/parts/reorder', requirePermission('exams.manage'), asyncHandler(c.reorderParts));
r.put('/:examId/sections/:sectionId/parts/:partId', requirePermission('exams.manage'), asyncHandler(c.updatePart));
r.delete('/:examId/sections/:sectionId/parts/:partId', requirePermission('exams.manage'), asyncHandler(c.removePart));
r.post('/:examId/sections/:sectionId/parts/:partId/instruction-audio', requirePermission('exams.manage'), uploadPartAudio, asyncHandler(c.uploadPartAudio));
r.delete('/:examId/sections/:sectionId/parts/:partId/instruction-audio', requirePermission('exams.manage'), asyncHandler(c.removePartAudio));

r.post('/:examId/sections/:sectionId/parts/:partId/questions', requirePermission('exams.manage'), asyncHandler(c.addQuestions));
r.put('/:examId/sections/:sectionId/parts/:partId/questions/reorder', requirePermission('exams.manage'), asyncHandler(c.reorderQuestions));
r.delete('/:examId/sections/:sectionId/parts/:partId/questions/:questionId', requirePermission('exams.manage'), asyncHandler(c.removeQuestion));

// Eligible questions (mode resolved from the Part on the server).
r.get('/:examId/parts/:partId/available-questions', requirePermission('exams.view'), asyncHandler(c.availableQuestions));

// Validation + lifecycle
r.get('/:examId/validation', requirePermission('exams.view'), asyncHandler(c.validation));
r.post('/:examId/publish', requirePermission('exams.manage'), asyncHandler(c.publish));
r.post('/:examId/deactivate', requirePermission('exams.manage'), asyncHandler(c.deactivate));

// Exam detail + update + delete (dynamic, registered last).
r.get('/:examId', requirePermission('exams.view'), asyncHandler(c.detail));
r.put('/:examId', requirePermission('exams.manage'), asyncHandler(c.update));
r.delete('/:examId', requirePermission('exams.manage'), asyncHandler(c.remove));

module.exports = r;
