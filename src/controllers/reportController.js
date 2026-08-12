const service = require('../modules/reports/reportService');
const manualService = require('../modules/reports/manualReportService');
const kpiConfigService = require('../modules/reports/kpiConfigService');
const detailRowConfigService = require('../modules/reports/detailRowConfigService');
module.exports = {
  async bootstrap(req,res){ res.json({success:true,data:await service.bootstrap()}); },
  async inspect(req,res){ res.status(201).json({success:true,data:await service.inspectUpload({body:req.body,userId:req.auth.userId})}); },
  async commit(req,res){ res.json({success:true,data:await service.commit(req.params.id,req.auth.userId),message:'Đồng bộ báo cáo thành công.'}); },
  async dashboard(req,res){ res.json({success:true,data:await service.dashboard(req.query)}); },
  async overview(req,res){ res.json({success:true,data:await service.overview(req.query)}); },
  async trend(req,res){ res.json({success:true,data:await service.trend(req.query)}); },
  async history(req,res){ res.json({success:true,data:await service.history(req.query)}); },
  async createManualPeriod(req,res){res.status(201).json({success:true,data:await manualService.create(req.body,req.auth.userId)});},
  async listManualPeriods(req,res){res.json({success:true,data:await manualService.list(req.query,req.auth)});},
  async findManualPeriod(req,res){res.json({success:true,data:await manualService.find(req.query,req.auth)});},
  async getManualPeriod(req,res){res.json({success:true,data:await manualService.get(req.params.periodId,req.auth)});},
  async manualWorkspace(req,res){res.json({success:true,data:await manualService.workspace(req.params.periodId,req.params.teamCode,req.auth)});},
  async exportManualTemplate(req,res){const result=await manualService.exportTemplate(req.params.periodId,req.params.teamCode,req.auth);res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`);res.send(result.buffer);},
  async importManualTemplate(req,res){res.json({success:true,data:await manualService.importTemplate(req.params.periodId,req.params.teamCode,req.body,req.auth)});},
  async saveManualWorkspace(req,res){res.json({success:true,data:await manualService.save(req.params.periodId,req.params.teamCode,req.body,req.auth.userId,req.auth),message:'Đã lưu dữ liệu báo cáo.'});},
  async manualTransition(req,res){res.json({success:true,data:await manualService.transition(req.params.periodId,req.params.teamCode,req.body,req.auth.userId,req.auth)});},
  async listManualAssignees(req,res){res.json({success:true,data:await manualService.assignees()});},
  async assignManualSubmission(req,res){res.json({success:true,data:await manualService.assign(req.params.periodId,req.params.teamCode,req.body,req.auth.userId),message:'Đã cập nhật người thực hiện.'});},
  async updateManualDeadline(req,res){res.json({success:true,data:await manualService.updateDeadline(req.params.periodId,req.body,req.auth.userId),message:'Đã cập nhật hạn nhập liệu.'});},
  async manualAuditTimeline(req,res){res.json({success:true,data:await manualService.audit(req.params.periodId,req.query,req.auth)});},
  async manualPublishChecklist(req,res){res.json({success:true,data:await manualService.checklist(req.params.periodId)});},
  async manualPreview(req,res){res.json({success:true,data:await manualService.preview(req.params.periodId,req.params.teamCode,req.auth)});},
  async publishManualPeriod(req,res){res.json({success:true,data:await manualService.publish(req.params.periodId,req.auth.userId),message:'Đã publish báo cáo.'});},
  async reopenManualPeriod(req,res){res.json({success:true,data:await manualService.reopen(req.params.periodId,req.auth.userId,req.body),message:'Đã thu hồi báo cáo để cập nhật.'});},
  async deleteManualPeriod(req,res){res.json({success:true,data:await manualService.remove(req.params.periodId),message:'Đã xóa kỳ báo cáo.'});},
  async listKpiConfig(req,res){res.json({success:true,data:await kpiConfigService.list(req.query)});},
  async createKpiConfig(req,res){res.status(201).json({success:true,data:await kpiConfigService.create(req.body,req.auth.userId),message:'Đã tạo chỉ số KPI.'});},
  async updateKpiConfig(req,res){res.json({success:true,data:await kpiConfigService.update(req.params.id,req.body,req.auth.userId),message:'Đã cập nhật chỉ số KPI.'});},
  async reorderKpiConfig(req,res){res.json({success:true,data:await kpiConfigService.reorder(req.body,req.auth.userId),message:'Đã cập nhật thứ tự KPI.'});},
  async listDetailRows(req,res){res.json({success:true,data:await detailRowConfigService.list(req.query)});},
  async createDetailRow(req,res){res.status(201).json({success:true,data:await detailRowConfigService.create(req.body),message:'Đã tạo dòng chi tiết.'});},
  async updateDetailRow(req,res){res.json({success:true,data:await detailRowConfigService.update(req.params.id,req.body),message:'Đã cập nhật dòng chi tiết.'});},
  async reorderDetailRows(req,res){res.json({success:true,data:await detailRowConfigService.reorder(req.body),message:'Đã cập nhật thứ tự dòng chi tiết.'});}
};
