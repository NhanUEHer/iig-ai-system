const service=require('../modules/question-bank-v3/contentService');
const list=async(req,res)=>res.json({success:true,data:await service.list(req.params.questionId)});
const create=async(req,res)=>res.status(201).json({success:true,data:await service.create(req.params.questionId,req.body)});
const update=async(req,res)=>res.json({success:true,data:await service.update(req.params.questionId,req.params.contentId,req.body)});
const remove=async(req,res)=>res.json({success:true,data:await service.remove(req.params.questionId,req.params.contentId)});
const reorder=async(req,res)=>res.json({success:true,data:await service.reorder(req.params.questionId,req.body.contentIds)});
module.exports={list,create,update,remove,reorder};
