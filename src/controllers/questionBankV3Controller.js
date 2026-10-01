const service=require('../modules/question-bank-v3/questionService');
const list=async(req,res)=>res.json({success:true,...await service.list(req.query)});
const filterOptions=async(req,res)=>res.json({success:true,data:await service.filterOptions(req.query)});
const detail=async(req,res)=>res.json({success:true,data:await service.get(req.params.id)});
const create=async(req,res)=>res.status(201).json({success:true,data:await service.create(req.body,req.auth?.userId)});
const update=async(req,res)=>res.json({success:true,data:await service.update(req.params.id,req.body,req.auth?.userId)});
const remove=async(req,res)=>{await service.remove(req.params.id);return res.json({success:true,id:req.params.id});};
module.exports={list,filterOptions,detail,create,update,remove};
