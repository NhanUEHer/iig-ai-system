const express = require('express');
const scoringController = require('../../controllers/scoringController');
const asyncHandler = require('../../http/asyncHandler');
const gradingJobController = require('../../controllers/gradingJobController');
const { requirePermission } = require('../../middleware/authenticate');

const router = express.Router();

router.post('/grade-ai', requirePermission('scoring.grade'), asyncHandler(scoringController.gradeAnswer));
router.put('/teacher-note', requirePermission('scoring.grade'), asyncHandler(scoringController.teacherNote));
router.post('/transcribe-ai', requirePermission('scoring.transcribe'), asyncHandler(scoringController.transcribeAnswer));
router.post('/clean-audio', requirePermission('scoring.clean_audio'), asyncHandler(scoringController.cleanAudio));
router.post('/bulk-clean-audio', requirePermission('scoring.clean_audio'), asyncHandler(scoringController.bulkCleanAudio));
router.post('/bulk-grade', requirePermission('scoring.grade'), asyncHandler(gradingJobController.create));
router.get('/grading-jobs/:id', requirePermission('scoring.grade'), asyncHandler(gradingJobController.detail));

module.exports = router;
