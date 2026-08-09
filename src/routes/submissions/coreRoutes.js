const express = require('express');
const submissionController = require('../../controllers/coreSubmissionController');
const asyncHandler = require('../../http/asyncHandler');
const { requirePermission } = require('../../middleware/authenticate');

const router = express.Router();

router.get('/', requirePermission('submissions.view'), submissionController.list);
router.post('/bulk-delete', requirePermission('submissions.delete'), submissionController.bulkRemove);
router.get('/file-url/:fileId', requirePermission('submissions.view'), submissionController.fileUrl);
router.get('/:id/answers', requirePermission('submissions.view'), asyncHandler(submissionController.answers));
router.get('/:id/answers/:answerId', requirePermission('submissions.view'), asyncHandler(submissionController.answerDetail));
router.get('/:id', requirePermission('submissions.view'), submissionController.detail);
router.delete('/:id', requirePermission('submissions.delete'), submissionController.remove);

module.exports = router;
