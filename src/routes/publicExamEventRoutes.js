const express = require('express');
const asyncHandler = require('../http/asyncHandler');
const controller = require('../controllers/publicExamEventController');

const router = express.Router();

router.get('/:eventId', asyncHandler(controller.detail));
router.post('/:eventId/registrations', asyncHandler(controller.register));
router.get('/:eventId/introduction', asyncHandler(controller.introduction));
router.post('/:eventId/attempts', asyncHandler(controller.startAttempt));
router.get('/:eventId/attempts/:attemptId/questions', asyncHandler(controller.questions));
router.put('/:eventId/attempts/:attemptId/answers/:subQuestionId', asyncHandler(controller.saveAnswer));
router.get('/:eventId/attempts/:attemptId/submission-summary', asyncHandler(controller.submissionSummary));
router.post('/:eventId/attempts/:attemptId/submit', asyncHandler(controller.submitAttempt));

module.exports = router;
