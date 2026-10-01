const express = require('express');
const asyncHandler = require('../http/asyncHandler');
const controller = require('../controllers/publicExamEventController');

const router = express.Router();

router.get('/:eventId', asyncHandler(controller.detail));
router.post('/:eventId/registrations', asyncHandler(controller.register));
router.get('/:eventId/introduction', asyncHandler(controller.introduction));
router.post('/:eventId/attempts', asyncHandler(controller.startAttempt));
router.get('/:eventId/attempts/:attemptId/manifest', asyncHandler(controller.attemptManifest));
router.get('/:eventId/attempts/:attemptId/structure', asyncHandler(controller.attemptStructure));
router.get('/:eventId/attempts/:attemptId/parts/:partId/questions', asyncHandler(controller.partQuestions));
router.get('/:eventId/attempts/:attemptId/questions/:subQuestionId', asyncHandler(controller.questionDetail));
router.get('/:eventId/attempts/:attemptId/questions', asyncHandler(controller.questions));
router.put('/:eventId/attempts/:attemptId/answers/:subQuestionId', asyncHandler(controller.saveAnswer));
router.post('/:eventId/attempts/:attemptId/questions/:subQuestionId/recordings', asyncHandler(controller.createRecording));
router.get('/:eventId/attempts/:attemptId/questions/:subQuestionId/recording', asyncHandler(controller.getRecording));
router.post('/:eventId/attempts/:attemptId/questions/:subQuestionId/recordings/:recordingId/finalize', asyncHandler(controller.finalizeRecording));
router.delete('/:eventId/attempts/:attemptId/questions/:subQuestionId/recordings/:recordingId', asyncHandler(controller.deleteRecording));
router.get('/:eventId/attempts/:attemptId/submission-summary', asyncHandler(controller.submissionSummary));
router.post('/:eventId/attempts/:attemptId/submit', asyncHandler(controller.submitAttempt));

module.exports = router;
