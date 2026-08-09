const service = require('../modules/reports/reportService');
const manualService = require('../modules/reports/manualReportService');
const kpiConfigService = require('../modules/reports/kpiConfigService');
const HttpError = require('../http/httpError');
module.exports = {
  async bootstrap(req,res){ res.json({success:true,data:await service.bootstrap()}); },
  async inspect(req,res){ res.status(201).json({success:true,data:await service.inspectUpload({body:req.body,userId:req.auth.userId})}); },
  async commit(req,res){ res.json({success:true,data:await service.commit(req.params.id,req.auth.userId),message:'Đồng bộ báo cáo thành công.'}); },
  async dashboard(req,res){ res.json({success:true,data:await service.dashboard(req.query)}); },
  async overview(req,res){ res.json({success:true,data:await service.overview(req.query)}); },
  async trend(req,res){ res.json({success:true,data:await service.trend(req.query)}); },
  async history(req,res){ res.json({success:true,data:await service.history(req.query)}); },
  async createManualPeriod(req,res){res.status(201).json({success:true,data:await manualService.create(req.body,req.auth.userId)});},
  async listManualPeriods(req,res){res.json({success:true,data:await manualService.list(req.query)});},
  async findManualPeriod(req,res){res.json({success:true,data:await manualService.find(req.query)});},
  async getManualPeriod(req,res){res.json({success:true,data:await manualService.get(req.params.periodId)});},
  async manualWorkspace(req,res){res.json({success:true,data:await manualService.workspace(req.params.periodId,req.params.teamCode)});},
  async saveManualWorkspace(req,res){res.json({success:true,data:await manualService.save(req.params.periodId,req.params.teamCode,req.body,req.auth.userId),message:'Đã lưu dữ liệu báo cáo.'});},
  async manualTransition(req,res){if(['approve','return'].includes(req.body?.action)&&!req.auth.permissions.includes('reports.manage'))throw new HttpError('Bạn không có quyền duyệt báo cáo.',403,'PERMISSION_DENIED');res.json({success:true,data:await manualService.transition(req.params.periodId,req.params.teamCode,req.body,req.auth.userId)});},
  async publishManualPeriod(req,res){res.json({success:true,data:await manualService.publish(req.params.periodId,req.auth.userId),message:'Đã publish báo cáo.'});},
  async reopenManualPeriod(req,res){res.json({success:true,data:await manualService.reopen(req.params.periodId,req.auth.userId),message:'Đã thu hồi báo cáo để cập nhật.'});},
  async deleteManualPeriod(req,res){res.json({success:true,data:await manualService.remove(req.params.periodId),message:'Đã xóa kỳ báo cáo.'});},
  async listKpiConfig(req,res){res.json({success:true,data:await kpiConfigService.list(req.query)});},
  async createKpiConfig(req,res){res.status(201).json({success:true,data:await kpiConfigService.create(req.body,req.auth.userId),message:'Đã tạo chỉ số KPI.'});},
  async updateKpiConfig(req,res){res.json({success:true,data:await kpiConfigService.update(req.params.id,req.body,req.auth.userId),message:'Đã cập nhật chỉ số KPI.'});},
  async reorderKpiConfig(req,res){res.json({success:true,data:await kpiConfigService.reorder(req.body,req.auth.userId),message:'Đã cập nhật thứ tự KPI.'});}
};
