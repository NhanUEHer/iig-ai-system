const express = require('express');
const asyncHandler = require('../http/asyncHandler');
const { requirePermission } = require('../middleware/authenticate');
const service = require('../modules/dictionary/dictionaryService');
const router = express.Router();

router.post('/extract', requirePermission('dictionary.generate','dictionary.manage'), asyncHandler(async (req,res) => res.json({ success:true,data:await service.extract(req.body.passage,req.user.id) })));
router.post('/', requirePermission('dictionary.manage'), asyncHandler(async (req,res) => res.status(201).json({ success:true,data:await service.saveCandidates(req.body,req.user.id) })));
router.post('/history/:id/generate', requirePermission('dictionary.generate','dictionary.manage'), asyncHandler(async (req,res) => res.status(202).json({ success:true,data:await service.startGeneration(req.params.id,req.body.candidateIds,req.user.id) })));
router.get('/history', requirePermission('dictionary.view','dictionary.manage'), asyncHandler(async (req,res) => res.json({ success:true,...await service.history(req.query) })));
router.get('/history/:id', requirePermission('dictionary.view','dictionary.manage'), asyncHandler(async (req,res) => res.json({ success:true,data:await service.detail(req.params.id) })));

module.exports = router;
