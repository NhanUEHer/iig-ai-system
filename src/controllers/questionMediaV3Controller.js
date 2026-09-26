const service=require('../modules/question-bank-v3/mediaService');
const param={CONTENT:'contentId',SUB_QUESTION:'subQuestionId',SAMPLE_ANSWER:'sampleAnswerId'};
const upload=scope=>async(req,res)=>res.status(201).json({success:true,data:await service.upload(scope,req.params[param[scope]],req.file,req.auth?.userId)});
const list=scope=>async(req,res)=>res.json({success:true,data:await service.list(scope,req.params[param[scope]])});
const remove=async(req,res)=>res.json({success:true,data:await service.remove(req.params.mediaId)});const url=async(req,res)=>res.json({success:true,data:{url:await service.url(req.params.mediaId)}});module.exports={upload,list,remove,url};
