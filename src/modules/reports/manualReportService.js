const HttpError=require('../../http/httpError');
const repository=require('./manualReportRepository');
const {TEAM_ENTRY_CONFIG,DETAIL_CONFIG}=require('./manualReportConfig');
const {calculate,validateWorkspace}=require('./manualReportCalculator');

const validPeriod=(year,month)=>{year=Number(year);month=Number(month);if(!Number.isInteger(year)||year<2000||year>2100||!Number.isInteger(month)||month<1||month>12)throw new HttpError('Kỳ báo cáo không hợp lệ.',400,'REPORT_PERIOD_INVALID');return{year,month};};
const numeric=value=>value===null||value===undefined||value===''?null:Number(value);
const direction=value=>['increase_good','decrease_good','monitor'].includes(value)?value:'monitor';
const evaluation=(target,actual,directionValue)=>target===null||actual===null?null:directionValue==='monitor'?'Theo dõi':directionValue==='increase_good'?(actual>=target?'Đạt':'Chưa đạt'):(actual<=target?'Đạt':'Chưa đạt');
const rate=(actual,base)=>actual===null||base===null||Number(base)===0?null:(actual-base)/base;
const achievement=(target,actual,directionValue)=>target===null||actual===null||directionValue==='monitor'?null:directionValue==='decrease_good'?(actual<=0?1.2:target/actual):(target===0?(actual>0?1.2:null):actual/target);
function sanitizeRows(detailKey,rows) {
  const columns=new Set(DETAIL_CONFIG[detailKey][1]);
  return (Array.isArray(rows)?rows:[]).map(row=>Object.fromEntries([...columns].map(key=>[key,row?.[key]===''||row?.[key]===undefined?null:row[key]])));
}
async function workspace(periodId,teamCode) {
  teamCode=String(teamCode||'').toUpperCase();const config=TEAM_ENTRY_CONFIG[teamCode];if(!config)throw new HttpError('Bộ phận không hợp lệ.',400,'REPORT_TEAM_INVALID');
  const base=await repository.getWorkspace(periodId,teamCode);if(!base)throw new HttpError('Không tìm thấy phiếu nhập liệu.',404,'REPORT_WORKSPACE_NOT_FOUND');
  let details=await repository.getDetails(base.version_id,config.detailKey);
  if(teamCode==='REV') {
    const history=await repository.getRevenueHistory(base.year,base.month);const key=row=>`${String(row.product_group||'').trim().toLowerCase()}|${String(row.product_name||'').trim().toLowerCase()}`;
    const previous=new Map(history.filter(x=>x.source_period==='previous').map(x=>[key(x),numeric(x.revenue)||0]));const prior=new Map(history.filter(x=>x.source_period==='prior_year').map(x=>[key(x),numeric(x.revenue)||0]));
    const total=details.reduce((sum,row)=>sum+(numeric(row.revenue)||0),0);
    details=details.map(row=>{const revenue=numeric(row.revenue),target=numeric(row.monthly_target),previousRevenue=previous.get(key(row))??0,priorYearRevenue=prior.get(key(row))??0;return{...row,previous_revenue:previousRevenue,prior_year_revenue:priorYearRevenue,revenue_share:total?revenue/total:null,achievement_rate:target?revenue/target:null,previous_change:rate(revenue,previousRevenue),prior_year_change:rate(revenue,priorYearRevenue)};});
  }
  if(teamCode==='COM')details=details.map(row=>({...row,followers_growth:rate(numeric(row.followers_current),numeric(row.followers_previous)),reach_growth:rate(numeric(row.reach_current),numeric(row.reach_previous))}));
  if(teamCode==='TRAIN')details=details.map(row=>({...row,student_achievement:numeric(row.student_target)?numeric(row.active_student_count)/numeric(row.student_target):null,output_rate:numeric(row.output_rate)??(numeric(row.completed_student_count)?numeric(row.qualified_student_count)/numeric(row.completed_student_count):null)}));
  let adsProducts=[];
  if(teamCode==='ADS')adsProducts=await repository.getDetails(base.version_id,'adsProducts');
  const kpis=base.kpis.map(kpi=>{const target=numeric(kpi.target_value),actual=numeric(kpi.actual_value),previous=numeric(kpi.previous_value)??0,prior=numeric(kpi.prior_year_value)??0;return{...kpi,previous_value:previous,prior_year_value:prior,achievement_rate:achievement(target,actual,kpi.evaluation_direction),previous_change:rate(actual,previous),prior_year_change:rate(actual,prior),evaluation:evaluation(target,actual,kpi.evaluation_direction)};});
  return {...base,kpis,config:{...config,fields:config.fields.map(([key,label,type,lookup,required=false])=>({key,label,type,lookup,required}))},details,adsProducts};
}

module.exports={
  async list(query){const year=query?.year?Number(query.year):null;if(year&&(!Number.isInteger(year)||year<2000||year>2100))throw new HttpError('Năm báo cáo không hợp lệ.',400,'REPORT_YEAR_INVALID');const status=query?.status?String(query.status):null;return repository.listPeriods({year,status});},
  async create(body,userId){const {year,month}=validPeriod(body?.year,body?.month);const deadline=body?.deadline?new Date(body.deadline):null;if(deadline&&Number.isNaN(deadline.getTime()))throw new HttpError('Hạn nhập liệu không hợp lệ.',400,'REPORT_DEADLINE_INVALID');const result=await repository.createPeriod({year,month,deadline,userId,copyTargets:body?.copyTargets!==false});if(result.locked)throw new HttpError('Kỳ báo cáo đã khóa, cần mở lại kỳ trước khi tạo phiên nhập liệu.',409,'REPORT_PERIOD_LOCKED');if(result.conflict)throw new HttpError('Kỳ này đã có phiên nhập liệu đang mở.',409,'REPORT_MANUAL_DRAFT_EXISTS');return result;},
  async find(query){const {year,month}=validPeriod(query.year,query.month);const result=await repository.findPeriod(year,month);if(!result)throw new HttpError('Kỳ báo cáo chưa được tạo.',404,'REPORT_PERIOD_NOT_FOUND');return result;},
  async get(periodId){const result=await repository.getPeriod(periodId);if(!result)throw new HttpError('Không tìm thấy kỳ báo cáo.',404,'REPORT_PERIOD_NOT_FOUND');return result;},
  workspace,
  async save(periodId,teamCode,body,userId){const current=await workspace(periodId,teamCode);const config=TEAM_ENTRY_CONFIG[current.team_code];if(!['draft','editing','returned'].includes(current.submission_status))throw new HttpError('Phiếu nhập liệu không còn ở trạng thái chỉnh sửa.',409,'REPORT_SUBMISSION_LOCKED');
    const rows=sanitizeRows(config.detailKey,body?.details);const adsProducts=current.team_code==='ADS'?sanitizeRows('adsProducts',body?.adsProducts):[];const incomingRows=Array.isArray(body?.kpis)?body.kpis:[];const incoming=new Map(incomingRows.map(item=>[String(item.code||'').trim().toUpperCase(),item]));
    const expectedCodes=current.kpis.map(item=>item.code);const incomingCodes=incomingRows.map(item=>String(item.code||'').trim().toUpperCase());
    if(incomingCodes.length!==expectedCodes.length||expectedCodes.some(code=>!incoming.has(code)))throw new HttpError('Bộ KPI của phiếu đã được cố định theo cấu hình kỳ báo cáo.',409,'REPORT_KPI_SET_LOCKED');
    const derived=calculate(current.team_code,rows,{});
    const kpis=current.kpis.map(kpi=>{const item=incoming.get(kpi.code)||{};const directionValue=direction(kpi.evaluation_direction);const target=numeric(item.target_value);const manualActual=numeric(item.actual_value);const actual=kpi.input_mode==='derived'&&Object.hasOwn(derived,kpi.code)?numeric(derived[kpi.code]):manualActual;return{...kpi,target_value:target,actual_value:actual,evaluation:evaluation(target,actual,directionValue),note:item.note||null};});
    const validation=validateWorkspace(kpis,rows,config.fields);const result=await repository.saveWorkspace({base:current,detailKey:config.detailKey,rows,extraDetails:current.team_code==='ADS'?{detailKey:'adsProducts',rows:adsProducts}:null,kpis,note:body?.note||{},validation,userId});if(!result)throw new HttpError('Không tìm thấy phiếu nhập liệu.',404,'REPORT_WORKSPACE_NOT_FOUND');if(result.conflict)throw new HttpError(`Phiếu đang ở trạng thái ${result.status}.`,409,'REPORT_SUBMISSION_STATE_INVALID');return workspace(periodId,teamCode);},
  async transition(periodId,teamCode,body,userId){const action=String(body?.action||'');const result=await repository.transition({periodId,teamCode:String(teamCode).toUpperCase(),action,note:body?.note,userId});if(!result)throw new HttpError('Không tìm thấy phiếu nhập liệu.',404,'REPORT_WORKSPACE_NOT_FOUND');if(result.conflict)throw new HttpError(`Không thể ${action} khi phiếu ở trạng thái ${result.status}.`,409,'REPORT_SUBMISSION_STATE_INVALID');if(result.validation)throw new HttpError('Phiếu còn lỗi dữ liệu, chưa thể gửi duyệt.',400,'REPORT_VALIDATION_FAILED',result.validation);return result;},
  async publish(periodId,userId){const result=await repository.publish(periodId,userId);if(!result)throw new HttpError('Không tìm thấy kỳ báo cáo.',404,'REPORT_PERIOD_NOT_FOUND');if(result.noDraft)throw new HttpError('Kỳ không có phiên nhập liệu để publish.',409,'REPORT_MANUAL_DRAFT_NOT_FOUND');if(result.pending)throw new HttpError(`Còn ${result.pending} bộ phận chưa được duyệt.`,409,'REPORT_TEAMS_PENDING');return result;},
  async reopen(periodId,userId){const result=await repository.reopen(periodId,userId);if(!result)throw new HttpError('Không tìm thấy kỳ báo cáo.',404,'REPORT_PERIOD_NOT_FOUND');if(result.conflict)throw new HttpError('Chỉ có thể thu hồi kỳ đã publish.',409,'REPORT_PERIOD_NOT_PUBLISHED');if(result.draftExists)throw new HttpError('Kỳ báo cáo đã có phiên chỉnh sửa đang mở.',409,'REPORT_MANUAL_DRAFT_EXISTS');return result;},
  async remove(periodId){const result=await repository.deletePeriod(periodId);if(!result)throw new HttpError('Không tìm thấy kỳ báo cáo.',404,'REPORT_PERIOD_NOT_FOUND');if(result.protected)throw new HttpError('Không thể xóa kỳ đã publish hoặc đã khóa.',409,'REPORT_PERIOD_DELETE_PROTECTED');return result;}
};
