const crypto = require('crypto');
const path = require('path');
const HttpError = require('../../http/httpError');
const repository = require('./reportRepository');
const { parseWorkbook } = require('./reportWorkbookParser');
const { healthScore, healthStatus } = require('./reportHealth');
const { validatePeriodMatch, validateKpiCatalog } = require('./reportImportValidation');
const VALID_TEAM_CODES = new Set(['REV','ADS','COM','TRADE','TRAIN','PROD']);

function validatePeriod(year, month) {
  year = Number(year); month = Number(month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) throw new HttpError('Kỳ báo cáo không hợp lệ.',400,'REPORT_PERIOD_INVALID');
  return { year,month };
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
    const {year,month}=validatePeriod(query.year,query.month); const teamCode=String(query.team || 'REV').toUpperCase();
    if (!VALID_TEAM_CODES.has(teamCode)) throw new HttpError('Bộ phận báo cáo không hợp lệ.',400,'REPORT_TEAM_INVALID');
    const result=await repository.getDashboard({year,month,teamCode});
    if(!result) throw new HttpError('Kỳ báo cáo chưa có dữ liệu.',404,'REPORT_DATA_NOT_FOUND');
    return result;
  },
  overview: async query => {
    const {year,month}=validatePeriod(query.year,query.month);
    const rows=await repository.getOverviewRows({year,month});
    if(!rows.length) throw new HttpError('Kỳ báo cáo chưa có dữ liệu.',404,'REPORT_DATA_NOT_FOUND');
    const teams=new Map(); const totals={total:0,good:0,near:0,risk:0,missing:0,scoreSum:0,scoreCount:0};
    rows.forEach(row=>{
      const score=healthScore(row); const status=healthStatus(score); totals.total++; totals[status]++; if(score!==null){totals.scoreSum+=Math.min(score,1.2);totals.scoreCount++;}
      if(!teams.has(row.team_code)) teams.set(row.team_code,{code:row.team_code,name:row.team_name,total:0,good:0,near:0,risk:0,missing:0,scoreSum:0,scoreCount:0});
      const team=teams.get(row.team_code); team.total++; team[status]++; if(score!==null){team.scoreSum+=Math.min(score,1.2);team.scoreCount++;}
    });
    const finish=item=>({...item,average:item.scoreCount?item.scoreSum/item.scoreCount:null,scoreSum:undefined,scoreCount:undefined});
    return {period:{year,month,publishedAt:rows[0].published_at},summary:finish(totals),teams:[...teams.values()].map(finish),kpis:rows};
  },
  trend: async query => {
    const year=Number(query.year); if(!Number.isInteger(year) || year<2000 || year>2100) throw new HttpError('Năm không hợp lệ.',400,'REPORT_PERIOD_INVALID');
    const teamCode=query.team?String(query.team).toUpperCase():null;
    if (teamCode && !VALID_TEAM_CODES.has(teamCode)) throw new HttpError('Bộ phận báo cáo không hợp lệ.',400,'REPORT_TEAM_INVALID');
    const rows=await repository.getTrendRows({year,teamCode});
    const months=new Map(); rows.forEach(row=>{const key=Number(row.month);if(!months.has(key))months.set(key,{month:key,sum:0,count:0,good:0,near:0,risk:0});const item=months.get(key);const score=healthScore(row);const status=healthStatus(score);if(status!=='missing')item[status]++;if(score!==null){item.sum+=Math.min(score,1.2);item.count++;}});
    return [...months.values()].map(item=>({month:item.month,average:item.count?item.sum/item.count:null,good:item.good,near:item.near,risk:item.risk}));
  },
  history: query => repository.listImports(Math.min(100,Math.max(1,Number(query.limit)||20)))
};
