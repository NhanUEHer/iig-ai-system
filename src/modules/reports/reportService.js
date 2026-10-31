const crypto = require('crypto');
const path = require('path');
const HttpError = require('../../http/httpError');
const repository = require('./reportRepository');
const { parseWorkbook } = require('./reportWorkbookParser');
const { actualTargetRatio, healthScore, healthStatus } = require('./reportHealth');
const { average, summarizeKpis, buildInsights } = require('./reportDashboardMetrics');
const { buildRevenueDashboard } = require('./reportRevenueDashboard');
const { buildAdsDashboard } = require('./reportAdsDashboard');
const { buildCommunicationDashboard } = require('./reportCommunicationDashboard');
const { buildTradeDashboard } = require('./reportTradeDashboard');
const { buildTrainingDashboard } = require('./reportTrainingDashboard');
const { buildProductDashboard } = require('./reportProductDashboard');
const { validatePeriodMatch, validateKpiCatalog } = require('./reportImportValidation');
const VALID_TEAM_CODES = new Set(['REV','ADS','COM','TRADE','TRAIN','PROD']);
const FINANCIAL_TREND_TEAMS = new Set(['REV','ADS','TRADE']);

function validatePeriod(year, month) {
  year = Number(year); month = Number(month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) throw new HttpError('Kỳ báo cáo không hợp lệ.',400,'REPORT_PERIOD_INVALID');
  return { year,month };
}

function validateTeamCode(value,{optional=false}={}) {
  if(optional&&!value)return null;
  const teamCode=String(value||'').toUpperCase();
  if(!VALID_TEAM_CODES.has(teamCode))throw new HttpError('Bộ phận báo cáo không hợp lệ.',400,'REPORT_TEAM_INVALID');
  return teamCode;
}

function parsePeriodToken(value,label) {
  const match=String(value||'').match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if(!match)throw new HttpError(`${label} phải có định dạng YYYY-MM.`,400,'REPORT_PERIOD_RANGE_INVALID');
  const year=Number(match[1]);
  if(year<2000||year>2100)throw new HttpError(`${label} nằm ngoài phạm vi hỗ trợ.`,400,'REPORT_PERIOD_RANGE_INVALID');
  return {year,month:Number(match[2]),date:`${match[1]}-${match[2]}-01`};
}

function dataQualityPayload(rows=[]) {
  const teams=rows.map(row=>{
    const total=Number(row.total_kpis)||0,completed=Number(row.completed_kpis)||0;
    const notesCompleted=['highlights_completed','issues_completed','risks_completed','proposals_completed'].filter(key=>Number(row[key])>0).length;
    const timestamps=[row.kpi_updated_at,row.submission_updated_at,row.period_updated_at].filter(Boolean).map(value=>new Date(value)).filter(value=>!Number.isNaN(value.getTime()));
    return {teamCode:row.team_code,teamName:row.team_name,submissionStatus:row.submission_status||null,assigned:Boolean(row.assigned_user_id),totalKpis:total,completedKpis:completed,missingKpis:Number(row.missing_kpis)||0,kpiCompleteness:total?completed/total:null,detailRows:Number(row.detail_rows)||0,notesCompleted,totalNotes:4,lastUpdated:timestamps.length?new Date(Math.max(...timestamps)).toISOString():null};
  });
  const totalKpis=teams.reduce((sum,item)=>sum+item.totalKpis,0),completedKpis=teams.reduce((sum,item)=>sum+item.completedKpis,0);
  return {period:rows[0]?{id:rows[0].period_id,year:Number(rows[0].year),month:Number(rows[0].month),status:rows[0].period_status,versionId:rows[0].version_id,versionStatus:rows[0].version_status,publishedAt:rows[0].published_at,deadline:rows[0].submission_deadline}:null,summary:{totalTeams:teams.length,assignedTeams:teams.filter(item=>item.assigned).length,approvedTeams:teams.filter(item=>item.submissionStatus==='approved').length,totalKpis,completedKpis,missingKpis:Math.max(0,totalKpis-completedKpis),kpiCompleteness:totalKpis?completedKpis/totalKpis:null,detailRows:teams.reduce((sum,item)=>sum+item.detailRows,0)},teams};
}

module.exports = {
  async inspectUpload({ body, userId }) {
    const { year,month } = validatePeriod(body?.year,body?.month);
    const fileName = String(body?.fileName || '').trim();
    const extension = path.extname(fileName).toLowerCase();
    const template = await repository.getActiveTemplate();
    const allowedExtensions = (template?.allowed_extensions || ['xlsx','xlsm','xls']).map(item => `.${String(item).toLowerCase()}`);
    if (!allowedExtensions.includes(extension)) throw new HttpError(`Chỉ chấp nhận file ${allowedExtensions.join(', ')}.`,400,'REPORT_FILE_TYPE_INVALID');
    const encoded = String(body?.fileBase64 || '').replace(/^data:[^;]+;base64,/, '');
    if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) throw new HttpError('Nội dung file không hợp lệ.',400,'REPORT_FILE_INVALID');
    const buffer = Buffer.from(encoded,'base64');
    const maxFileSize = Number(template?.max_file_size_bytes) || 10 * 1024 * 1024;
    if (!buffer.length || buffer.length > maxFileSize) throw new HttpError(`File trống hoặc vượt quá ${Math.round(maxFileSize/1024/1024)} MB.`,400,'REPORT_FILE_SIZE_INVALID');
    const parsed = parseWorkbook(buffer,year,month,{ requiredSheets:template?.required_sheets });
    validatePeriodMatch(parsed.filePeriod, { year, month });
    const codes = parsed.kpis.map(kpi => kpi.code);
    const definitions = await repository.listActiveKpiDefinitions(codes);
    validateKpiCatalog(parsed.kpis, definitions);
    const record = await repository.createInspection({ year,month,userId,fileName,mimeType:body?.mimeType || 'application/octet-stream',fileSize:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),templateVersion:template?.version || null,parsed });
    return {
      importId:record.id, period:{year,month}, filePeriod:parsed.filePeriod,
      warnings:parsed.warnings, missingActuals:parsed.missingActuals,
      summary:{ kpis:parsed.kpis.length,...Object.fromEntries(Object.entries(parsed.details).map(([key,value]) => [key,value.length])),notes:parsed.notes.length },
      review:{ kpis:parsed.kpis,details:parsed.details,notes:parsed.notes,teamStatuses:parsed.teamStatuses }
    };
  },
  async commit(id,userId) {
    let result;
    try { result = await repository.commitImport(id,userId); }
    catch (error) { try { await repository.markImportFailed(id,error); } catch (_) {} throw error; }
    if (!result) throw new HttpError('Không tìm thấy phiên import.',404,'REPORT_IMPORT_NOT_FOUND');
    if (result.conflict) throw new HttpError(`Phiên import đang ở trạng thái ${result.status}.`,409,'REPORT_IMPORT_STATE_INVALID');
    if (result.locked) throw new HttpError('Kỳ báo cáo đã khóa.',409,'REPORT_PERIOD_LOCKED');
    return result;
  },
  bootstrap: () => repository.listBootstrap(),
  dashboard: async query => {
    const {year,month}=validatePeriod(query.year,query.month); const teamCode=validateTeamCode(query.team||'REV');
    const [result,qualityRows]=await Promise.all([repository.getDashboard({year,month,teamCode}),repository.getDashboardDataQuality({year,month,teamCode})]);
    if(!result) throw new HttpError('Kỳ báo cáo chưa có dữ liệu.',404,'REPORT_DATA_NOT_FOUND');
    const summary=summarizeKpis(result.kpis),quality=qualityRows?dataQualityPayload(qualityRows):null;
    return {...result,summary,comparisons:{previousAchievement:summary.previousAchievement,previousChange:summary.previousChange,priorYearAchievement:summary.priorYearAchievement,priorYearChange:summary.priorYearChange},alerts:buildInsights(result.kpis),dataQuality:quality?.teams?.[0]||null};
  },
  revenueDashboard: async query=>{
    const {year,month}=validatePeriod(query.year,query.month);
    const dashboard=await repository.getDashboard({year,month,teamCode:'REV'});
    if(!dashboard)throw new HttpError('Kỳ báo cáo chưa có dữ liệu doanh thu.',404,'REPORT_DATA_NOT_FOUND');
    const rows=await repository.getTrendRows({teamCode:'REV',periodId:null,startPeriod:`${year}-01-01`,endPeriod:`${year}-12-01`,kpiCode:'DT_01'});
    const monthly=rows.filter(row=>Number(row.month)<=month).map(row=>({year:row.year,month:row.month,actual:row.actual_value,target:row.target_value}));
    return buildRevenueDashboard({dashboard,monthly});
  },
  adsDashboard: async query=>{
    const {year,month}=validatePeriod(query.year,query.month);
    const dashboard=await repository.getDashboard({year,month,teamCode:'ADS'});
    if(!dashboard)throw new HttpError('Kỳ báo cáo chưa có dữ liệu Marketing Ads.',404,'REPORT_DATA_NOT_FOUND');
    return buildAdsDashboard(dashboard);
  },
  communicationDashboard: async query=>{
    const {year,month}=validatePeriod(query.year,query.month);
    const [dashboard,monthly]=await Promise.all([repository.getDashboard({year,month,teamCode:'COM'}),repository.getSocialTrendRows(year)]);
    if(!dashboard)throw new HttpError('Kỳ báo cáo chưa có dữ liệu Truyền thông.',404,'REPORT_DATA_NOT_FOUND');
    return buildCommunicationDashboard({dashboard,monthly});
  },
  tradeDashboard: async query=>{const {year,month}=validatePeriod(query.year,query.month);const dashboard=await repository.getDashboard({year,month,teamCode:'TRADE'});if(!dashboard)throw new HttpError('Kỳ báo cáo chưa có dữ liệu Trade.',404,'REPORT_DATA_NOT_FOUND');return buildTradeDashboard(dashboard);},
  trainingDashboard: async query=>{const {year,month}=validatePeriod(query.year,query.month);const [dashboard,monthly]=await Promise.all([repository.getDashboard({year,month,teamCode:'TRAIN'}),repository.getTrainingTrendRows(year)]);if(!dashboard)throw new HttpError('Kỳ báo cáo chưa có dữ liệu Đào tạo.',404,'REPORT_DATA_NOT_FOUND');return buildTrainingDashboard({dashboard,monthly});},
  productDashboard: async query=>{const {year,month}=validatePeriod(query.year,query.month);const dashboard=await repository.getDashboard({year,month,teamCode:'PROD'});if(!dashboard)throw new HttpError('Kỳ báo cáo chưa có dữ liệu Sản phẩm.',404,'REPORT_DATA_NOT_FOUND');return buildProductDashboard(dashboard);},
  overview: async query => {
    const {year,month}=validatePeriod(query.year,query.month);
    const [rows,qualityRows,financialTrend]=await Promise.all([repository.getOverviewRows({year,month}),repository.getDashboardDataQuality({year,month}),repository.getOverviewFinancialTrend(year)]);
    if(!rows.length) throw new HttpError('Kỳ báo cáo chưa có dữ liệu.',404,'REPORT_DATA_NOT_FOUND');
    const teams=new Map(); const totals={total:0,good:0,near:0,risk:0,missing:0,scoreSum:0,scoreCount:0};
    rows.forEach(row=>{
      const score=healthScore(row); const status=healthStatus(score); totals.total++; totals[status]++; if(score!==null){totals.scoreSum+=Math.min(score,1.2);totals.scoreCount++;}
      if(!teams.has(row.team_code)) teams.set(row.team_code,{code:row.team_code,name:row.team_name,total:0,good:0,near:0,risk:0,missing:0,scoreSum:0,scoreCount:0});
      const team=teams.get(row.team_code); team.total++; team[status]++; if(score!==null){team.scoreSum+=Math.min(score,1.2);team.scoreCount++;}
    });
    const finish=item=>({...item,average:item.scoreCount?item.scoreSum/item.scoreCount:null,scoreSum:undefined,scoreCount:undefined});
    const legacySummary=finish(totals),legacyTeams=[...teams.values()].map(finish),company=summarizeKpis(rows);
    const teamSummaries=legacyTeams.map(team=>({...team,...summarizeKpis(rows.filter(row=>row.team_code===team.code))}));
    return {period:{year,month,publishedAt:rows[0].published_at},summary:legacySummary,company,teams:teamSummaries,attentionItems:buildInsights(rows,12),dataQuality:qualityRows?dataQualityPayload(qualityRows):null,financialTrend:financialTrend.map(item=>({year:Number(item.year),month:Number(item.month),revenue:Number(item.revenue)||0,recordedCost:Number(item.recorded_cost)||0})),kpis:rows};
  },
  trend: async query => {
    const year=Number(query.year),parsedStart=query.from?parsePeriodToken(query.from,'Kỳ bắt đầu'):null,parsedEnd=query.to?parsePeriodToken(query.to,'Kỳ kết thúc'):null;
    const fallbackYear=Number.isInteger(year)&&year>=2000&&year<=2100?year:parsedStart?.year||parsedEnd?.year;
    if(!fallbackYear)throw new HttpError('Năm không hợp lệ.',400,'REPORT_PERIOD_INVALID');
    const start=parsedStart||{date:`${fallbackYear}-01-01`};
    const end=parsedEnd||{date:`${fallbackYear}-12-01`};
    if(start.date>end.date)throw new HttpError('Kỳ bắt đầu không được sau kỳ kết thúc.',400,'REPORT_PERIOD_RANGE_INVALID');
    const teamCode=validateTeamCode(query.team,{optional:true});
    const periodId=query.periodId?String(query.periodId):null;
    const kpiCode=query.kpiCode?String(query.kpiCode).trim().toUpperCase():null;
    const metric=String(query.metric||'achievement');if(!['achievement','actual','target'].includes(metric))throw new HttpError('Metric xu hướng không hợp lệ.',400,'REPORT_TREND_METRIC_INVALID');
    const rows=await repository.getTrendRows({teamCode,periodId,startPeriod:start.date,endPeriod:end.date,kpiCode});
    const emptySeries=()=>({scores:[],actuals:[],targets:[],evaluated:0,monitored:0});
    const addRow=(series,row)=>{const monitor=row.evaluation_direction==='monitor',ratio=monitor?actualTargetRatio(row):healthScore(row);if(ratio!==null)series.scores.push(Math.min(ratio,1.2));const actual=Number(row.actual_value),target=Number(row.target_value);if(row.actual_value!==null&&Number.isFinite(actual))series.actuals.push(actual);if(row.target_value!==null&&Number.isFinite(target))series.targets.push(target);if(monitor)series.monitored++;else if(ratio!==null)series.evaluated++;};
    const finishSeries=series=>{const achievement=average(series.scores),actual=average(series.actuals),target=average(series.targets);return{average:achievement,achievement,actual,target,value:metric==='actual'?actual:metric==='target'?target:achievement,total:series.scores.length,evaluated:series.evaluated,monitored:series.monitored};};
    const months=new Map();rows.forEach(row=>{const key=`${row.year}-${String(row.month).padStart(2,'0')}`;if(!months.has(key))months.set(key,{period:key,year:Number(row.year),month:Number(row.month),company:emptySeries(),financial:emptySeries(),operational:emptySeries()});const item=months.get(key);addRow(item.company,row);addRow(FINANCIAL_TREND_TEAMS.has(row.team_code)?item.financial:item.operational,row);});
    return [...months.values()].map(item=>{const company=finishSeries(item.company),financial=finishSeries(item.financial),operational=finishSeries(item.operational);return{period:item.period,year:item.year,month:item.month,...company,series:{company,financial,operational}};});
  },
  insights: async query=>{
    const {year,month}=validatePeriod(query.year,query.month),teamCode=validateTeamCode(query.team,{optional:true});
    let rows=await repository.getOverviewRows({year,month});if(teamCode)rows=rows.filter(row=>row.team_code===teamCode);
    if(!rows.length)throw new HttpError('Kỳ báo cáo chưa có dữ liệu.',404,'REPORT_DATA_NOT_FOUND');
    const limit=Math.min(50,Math.max(1,Number(query.limit)||12));
    return{period:{year,month},teamCode,summary:summarizeKpis(rows),items:buildInsights(rows,limit)};
  },
  dataQuality: async query=>{
    const {year,month}=validatePeriod(query.year,query.month),teamCode=validateTeamCode(query.team,{optional:true});
    const rows=await repository.getDashboardDataQuality({year,month,teamCode});
    if(!rows)throw new HttpError('Kỳ báo cáo chưa có dữ liệu.',404,'REPORT_DATA_NOT_FOUND');
    return dataQualityPayload(rows);
  },
  history: query => repository.listImports(Math.min(100,Math.max(1,Number(query.limit)||20)))
};
