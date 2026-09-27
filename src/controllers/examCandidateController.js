const service=require('../modules/exam-candidates/examCandidateService');
const exporter=require('../modules/exam-candidates/examCandidateExporter');
const list=async(req,res)=>res.json({success:true,...await service.list(req.query)});
const filterOptions=async(req,res)=>res.json({success:true,data:await service.filterOptions()});
const exportExcel=async(req,res)=>{const buffer=await exporter.create(req.query);res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename="exam-candidates-${new Date().toISOString().slice(0,10)}.xlsx"`);res.send(buffer);};
module.exports={list,filterOptions,exportExcel};
