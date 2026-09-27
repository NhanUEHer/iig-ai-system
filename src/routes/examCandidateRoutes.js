const express=require('express');const asyncHandler=require('../http/asyncHandler');const {requirePermission}=require('../middleware/authenticate');const controller=require('../controllers/examCandidateController');const router=express.Router();
router.get('/',requirePermission('exam_candidates.view'),asyncHandler(controller.list));
router.get('/filter-options',requirePermission('exam_candidates.view'),asyncHandler(controller.filterOptions));
router.get('/export',requirePermission('exam_candidates.export'),asyncHandler(controller.exportExcel));
module.exports=router;
