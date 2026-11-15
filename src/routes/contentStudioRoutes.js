const express = require('express');
const multer = require('multer');
const asyncHandler = require('../http/asyncHandler');
const HttpError = require('../http/httpError');
const { requirePermission } = require('../middleware/authenticate');
const service = require('../modules/content-studio/contentStudioService');
const { docxToText } = require('../modules/content-studio/detect/docxText');
const generation = require('../modules/content-studio/generation/generationService');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single('file');
const VIEW = ['content_studio.view', 'content_studio.edit', 'content_studio.generate'];
const EDIT = ['content_studio.edit'];
const FOLDERS = ['content_studio.manage_folders'];
const GENERATE = ['content_studio.generate'];

router.get('/folders', requirePermission(...VIEW), asyncHandler(async (req, res) => res.json({ success: true, data: await service.listFolders() })));
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
router.post('/items', requirePermission(...EDIT), asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await service.createItem(req.body, req.user.id) })));
router.get('/items/:id', requirePermission(...VIEW), asyncHandler(async (req, res) => res.json({ success: true, data: await service.getItem(req.params.id) })));
router.patch('/items/:id', requirePermission(...EDIT), asyncHandler(async (req, res) => res.json({ success: true, data: await service.updateItem(req.params.id, req.body) })));
router.put('/items/:id/content', requirePermission(...EDIT), asyncHandler(async (req, res) => res.json({ success: true, data: await service.updateContent(req.params.id, req.body) })));
router.delete('/items/:id', requirePermission(...EDIT), asyncHandler(async (req, res) => res.json({ success: true, data: await service.deleteItem(req.params.id) })));

router.post('/items/:id/generate', requirePermission(...GENERATE), asyncHandler(async (req, res) => res.status(202).json({ success: true, data: await generation.enqueue(req.params.id, req.body?.tasks) })));
router.post('/artifacts/:id/regenerate', requirePermission(...GENERATE), asyncHandler(async (req, res) => res.status(202).json({ success: true, data: await generation.regenerate(req.params.id) })));
router.put('/artifacts/:id', requirePermission(...EDIT), asyncHandler(async (req, res) => res.json({ success: true, data: await generation.saveEdit(req.params.id, req.body?.content, req.user.id) })));

module.exports = router;
