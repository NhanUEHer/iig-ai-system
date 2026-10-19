const express=require('express');
const asyncHandler=require('../http/asyncHandler');
const {requirePermission}=require('../middleware/authenticate');
const service=require('../modules/learning-materials/learningMaterialService');
const router=express.Router();

router.get('/history',requirePermission('key_vocab.view','key_vocab.manage','dictionary.view','dictionary.manage'),asyncHandler(async(req,res)=>{
  res.json({success:true,...await service.history(req.query)});
}));

module.exports=router;

