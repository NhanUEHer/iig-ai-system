const express = require('express');
const asyncHandler = require('../http/asyncHandler');
const controller = require('../controllers/publicExamCatalogController');

const router = express.Router();
router.get('/groups', asyncHandler(controller.groups));
router.post('/:examId/candidates', asyncHandler(controller.register));
router.post('/:examId/attempts', asyncHandler(controller.startAttempt));
router.post('/:examId/attempts/:attemptId/resume', asyncHandler(controller.resumeAttempt));
router.get('/:examId/attempts/:attemptId/structure', asyncHandler(controller.structure));
router.get('/:examId/attempts/:attemptId/parts/:partId/questions', asyncHandler(controller.partQuestions));
router.get('/:examId/attempts/:attemptId/question-groups/:parentQuestionId', asyncHandler(controller.questionGroup));
router.put('/:examId/attempts/:attemptId/answers/:subQuestionId', asyncHandler(controller.saveAnswer));
router.post('/:examId/attempts/:attemptId/submit', asyncHandler(controller.submitAttempt));
router.get('/:examId/attempts/:attemptId/result', asyncHandler(controller.attemptResult));
router.get('/:examId', asyncHandler(controller.detail));
router.get('/', asyncHandler(controller.list));

module.exports = router;
