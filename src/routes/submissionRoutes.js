const express = require('express');
const router = express.Router();
const submissionController = require('../controllers/submissionController');

// Mappings Batch sync (1000 items)
router.post('/sync-mappings', submissionController.syncMappings);

// Keycode submission detail sync
router.post('/sync', submissionController.syncSubmission);

// List submissions
router.get('/', submissionController.listSubmissions);
router.post('/bulk-delete', submissionController.bulkDeleteSubmissions);

// Get temporary URL for a file ID dynamically
router.get('/file-url/:fileId', submissionController.getFileUrl);

// Keycode mappings manual management
router.get('/mappings', submissionController.listMappings);
router.post('/mappings', submissionController.saveMapping);
router.delete('/mappings/:keycode', submissionController.deleteMapping);

// Trigger AI grading for a single answer
router.post('/grade-ai', submissionController.gradeAnswerWithAI);

// Trigger AI transcription (STT) for a single answer
router.post('/transcribe-ai', submissionController.transcribeAnswerWithAI);

// Single submission detail
router.get('/:id', submissionController.getSubmissionDetail);
router.delete('/:id', submissionController.deleteSubmission);

module.exports = router;
