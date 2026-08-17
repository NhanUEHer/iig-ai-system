const express = require('express');
const asyncHandler = require('../http/asyncHandler');
const { requirePermission } = require('../middleware/authenticate');
const service = require('../modules/key-vocab/keyVocabService');
const exporter = require('../modules/key-vocab/keyVocabExporter');
const router = express.Router();

router.post('/generate', requirePermission('key_vocab.generate','key_vocab.manage'), asyncHandler(async (req, res) => {
  const data = await service.generate(req.body.passage, req.user.id);
  res.json({ success: true, data });
}));
router.post('/', requirePermission('key_vocab.manage'), asyncHandler(async (req, res) => {
  const data = await service.save(req.body, req.user.id);
  res.status(201).json({ success: true, data });
}));
router.post('/export', requirePermission('key_vocab.generate','key_vocab.manage'), asyncHandler(async (req, res) => {
  const file = await exporter.createWorkbook(req.body.vocabularies);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="KeyVocabulary_Import.xlsx"');
  res.send(file);
}));
router.get('/history', requirePermission('key_vocab.view','key_vocab.manage'), asyncHandler(async (req, res) => {
  const result = await service.history(req.query); res.json({ success: true, ...result });
}));
router.get('/history/:id', requirePermission('key_vocab.view','key_vocab.manage'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await service.detail(req.params.id) });
}));
router.get('/history/:id/export', requirePermission('key_vocab.view','key_vocab.manage'), asyncHandler(async (req, res) => {
  const detail = await service.detail(req.params.id);
  const file = await exporter.createWorkbook(detail.vocabularies);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="KeyVocabulary_${req.params.id.slice(0, 8)}.xlsx"`);
  res.send(file);
}));
module.exports = router;
