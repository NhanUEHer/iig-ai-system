const express = require('express');
const multer = require('multer');
const asyncHandler = require('../http/asyncHandler');
const HttpError = require('../http/httpError');
const { requirePermission } = require('../middleware/authenticate');
const service = require('../modules/content-studio/contentStudioService');
const { docxToText } = require('../modules/content-studio/detect/docxText');
const generation = require('../modules/content-studio/generation/generationService');
const dictionary = require('../modules/content-studio/dictionary/dictionaryService');
const stale = require('../modules/content-studio/staleService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single('file');
const VIEW = ['content_studio.view', 'content_studio.edit', 'content_studio.generate'];
const EDIT = ['content_studio.edit'];
const FOLDERS = ['content_studio.manage_folders'];
const GENERATE = ['content_studio.generate'];

router.get('/folders', requirePermission(...VIEW), asyncHandler(async (req, res) => res.json({ success: true, data: await service.listFolders() })));
router.get('/folders/summary', requirePermission(...VIEW), asyncHandler(async (req, res) => res.json({ success: true, data: await service.folderSummary() })));
router.post('/folders', requirePermission(...FOLDERS), asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.createFolder(req.body, req.user.id) })));
router.patch('/folders/:id', requirePermission(...FOLDERS), asyncHandler(async (req, res) => res.json({ success: true, data: await service.updateFolder(req.params.id, req.body) })));
router.delete('/folders/:id', requirePermission(...FOLDERS), asyncHandler(async (req, res) => res.json({ success: true, data: await service.deleteFolder(req.params.id) })));

router.post('/detect', requirePermission(...EDIT), asyncHandler(async (req, res) => res.json({ success: true, data: service.detect(req.body.text) })));
router.post('/detect/docx', requirePermission(...EDIT), upload, asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError('Chưa chọn file.', 400, 'NO_FILE');
  if (!/\.docx$/i.test(req.file.originalname)) throw new HttpError('Chỉ hỗ trợ file .docx.', 400, 'INVALID_DOCX');
  const text = await docxToText(req.file.buffer);
  res.json({ success: true, data: { text, fileName: req.file.originalname, detection: service.detect(text) } });
}));

router.get('/items', requirePermission(...VIEW), asyncHandler(async (req, res) => res.json({ success: true, data: await service.listItems(req.query) })));
router.get('/items/recent', requirePermission(...VIEW), asyncHandler(async (req, res) => res.json({ success: true, data: await service.recentItems(req.query) })));
router.get('/attention', requirePermission(...VIEW), asyncHandler(async (_req, res) => res.json({ success: true, data: await service.attention() })));
router.post('/items', requirePermission(...EDIT), asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.createItem(req.body, req.user.id) })));
router.get('/items/:id', requirePermission(...VIEW), asyncHandler(async (req, res) => res.json({ success: true, data: await service.getItem(req.params.id) })));
router.patch('/items/:id', requirePermission(...EDIT), asyncHandler(async (req, res) => res.json({ success: true, data: await service.updateItem(req.params.id, req.body) })));
router.put('/items/:id/content', requirePermission(...EDIT), asyncHandler(async (req, res) => res.json({ success: true, data: await service.updateContent(req.params.id, req.body) })));
router.delete('/items/:id', requirePermission(...EDIT), asyncHandler(async (req, res) => res.json({ success: true, data: await service.deleteItem(req.params.id) })));

router.post('/items/:id/regenerate-stale', requirePermission(...GENERATE), asyncHandler(async (req, res) => res.status(202).json({ success: true, data: await stale.regenerateStale(req.params.id) })));
router.post('/items/:id/generate', requirePermission(...GENERATE), asyncHandler(async (req, res) => res.status(202).json({ success: true, data: await generation.enqueue(req.params.id, req.body?.tasks) })));
router.post('/items/:id/dictionary/extract', requirePermission(...GENERATE), asyncHandler(async (req, res) => res.status(202).json({ success: true, data: await dictionary.extract(req.params.id) })));
router.get('/items/:id/dictionary', requirePermission(...VIEW), asyncHandler(async (req, res) => res.json({ success: true, data: await dictionary.getState(req.params.id) })));
router.put('/items/:id/dictionary/list', requirePermission(...EDIT), asyncHandler(async (req, res) => res.json({ success: true, data: await dictionary.saveList(req.params.id, req.body?.sentences) })));
router.post('/items/:id/dictionary/generate', requirePermission(...GENERATE), asyncHandler(async (req, res) => res.status(202).json({ success: true, data: await dictionary.generate(req.params.id, req.body || {}) })));
router.put('/dictionary/entries/:candidateId', requirePermission(...EDIT), asyncHandler(async (req, res) => res.json({ success: true, data: await dictionary.saveEntry(req.params.candidateId, req.body?.content || req.body) })));
router.post('/dictionary/entries/:candidateId/regenerate', requirePermission(...GENERATE), asyncHandler(async (req, res) => res.status(202).json({ success: true, data: await dictionary.regenerateEntry(req.params.candidateId) })));
router.delete('/dictionary/candidates/:candidateId', requirePermission(...EDIT), asyncHandler(async (req, res) => res.json({ success: true, data: await dictionary.removeCandidate(req.params.candidateId) })));
router.post('/artifacts/:id/regenerate', requirePermission(...GENERATE), asyncHandler(async (req, res) => res.status(202).json({ success: true, data: await generation.regenerate(req.params.id) })));
router.put('/artifacts/:id', requirePermission(...EDIT), asyncHandler(async (req, res) => res.json({ success: true, data: await generation.saveEdit(req.params.id, req.body?.content, req.user.id) })));

module.exports = router;
