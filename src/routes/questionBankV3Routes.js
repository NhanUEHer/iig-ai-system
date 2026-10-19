const express = require('express');
const asyncHandler = require('../http/asyncHandler');
const { requirePermission } = require('../middleware/authenticate');
const c = require('../controllers/questionBankV3Controller');
const content = require('../controllers/questionContentV3Controller');
const subQuestion = require('../controllers/questionSubQuestionV3Controller');
const media = require('../controllers/questionMediaV3Controller');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } }).single('file');
const groups = require('../controllers/questionGroupController');
const router = express.Router();

// Question group dropdown + management (see question-group-management-spec.md).
router.get('/groups', requirePermission('question_bank.view'), asyncHandler(async (req, res) => { const r = await require('../config/db').query("SELECT id,code,title AS name,description,status FROM question_groups WHERE status='ACTIVE' ORDER BY title"); res.json({ success: true, data: r.rows }); }));
router.get('/question-groups', requirePermission('question_bank.view'), asyncHandler(groups.list));
router.get('/question-groups/:id', requirePermission('question_bank.view'), asyncHandler(groups.detail));
router.post('/question-groups', requirePermission('question_bank.taxonomy_manage'), asyncHandler(groups.create));
router.put('/question-groups/:id', requirePermission('question_bank.taxonomy_manage'), asyncHandler(groups.update));
router.delete('/question-groups/:id', requirePermission('question_bank.taxonomy_manage'), asyncHandler(groups.remove));

// Filter metadata for the list screen.
router.get('/questions/filter-options', requirePermission('question_bank.view'), asyncHandler(c.filterOptions));

// Content media (direct audio/image/video links per content).
router.post('/questions/:questionId/media/:mediaType', requirePermission('question_bank.media_manage'), upload, asyncHandler(media.uploadStagedMedia));
router.post('/contents/:contentId/media/:mediaType', requirePermission('question_bank.media_manage'), upload, asyncHandler(media.uploadContentMedia));
router.delete('/contents/:contentId/media/:mediaType', requirePermission('question_bank.media_manage'), asyncHandler(media.removeContentMedia));

// Sub-question audio (single direct audio link).
router.post('/sub-questions/:subQuestionId/audio', requirePermission('question_bank.media_manage'), upload, asyncHandler(media.uploadSubQuestionAudio));
router.delete('/sub-questions/:subQuestionId/audio', requirePermission('question_bank.media_manage'), asyncHandler(media.removeSubQuestionAudio));

router.get('/media/:mediaId/url', requirePermission('question_bank.view'), asyncHandler(media.url));

// Sub-question CRUD + bulk save for the Câu hỏi tab.
router.get('/questions/:questionId/sub-questions', requirePermission('question_bank.view'), asyncHandler(subQuestion.list));
router.put('/questions/:questionId/sub-questions/reorder', requirePermission('question_bank.manage'), asyncHandler(subQuestion.reorder));
router.put('/questions/:questionId/sub-questions', requirePermission('question_bank.manage'), asyncHandler(subQuestion.saveAll));
router.post('/questions/:questionId/sub-questions', requirePermission('question_bank.manage'), asyncHandler(subQuestion.create));
router.put('/questions/:questionId/sub-questions/:subQuestionId', requirePermission('question_bank.manage'), asyncHandler(subQuestion.update));
router.delete('/questions/:questionId/sub-questions/:subQuestionId', requirePermission('question_bank.manage'), asyncHandler(subQuestion.remove));

// Content CRUD + bulk save for the Nội dung tab.
router.get('/questions/:questionId/contents', requirePermission('question_bank.view'), asyncHandler(content.list));
router.put('/questions/:questionId/contents/reorder', requirePermission('question_bank.manage'), asyncHandler(content.reorder));
router.put('/questions/:questionId/contents', requirePermission('question_bank.manage'), asyncHandler(content.saveAll));
router.post('/questions/:questionId/contents', requirePermission('question_bank.manage'), asyncHandler(content.create));
router.put('/questions/:questionId/contents/:contentId', requirePermission('question_bank.manage'), asyncHandler(content.update));
router.delete('/questions/:questionId/contents/:contentId', requirePermission('question_bank.manage'), asyncHandler(content.remove));

// Parent question CRUD.
router.get('/questions', requirePermission('question_bank.view'), asyncHandler(c.list));
router.get('/questions/:id', requirePermission('question_bank.view'), asyncHandler(c.detail));
router.post('/questions', requirePermission('question_bank.manage'), asyncHandler(c.create));
router.put('/questions/:id', requirePermission('question_bank.manage'), asyncHandler(c.update));
router.delete('/questions/:id', requirePermission('question_bank.manage'), asyncHandler(c.remove));

module.exports = router;
