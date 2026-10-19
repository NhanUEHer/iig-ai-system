const HttpError=require('../../http/httpError');
const repository=require('./kpiConfigRepository');
const TEAMS=new Set(['REV','ADS','COM','TRADE','TRAIN','PROD']);
const DIRECTIONS=new Set(['increase_good','decrease_good','monitor']);
const INPUT_MODES=new Set(['manual','derived']);
const required=(value,label)=>{const result=String(value||'').trim();if(!result)throw new HttpError(`${label} là bắt buộc.`,400,'REPORT_KPI_CONFIG_INVALID');return result;};
const team=value=>{const result=String(value||'').toUpperCase();if(!TEAMS.has(result))throw new HttpError('Bộ phận không hợp lệ.',400,'REPORT_TEAM_INVALID');return result;};
const payload=body=>{const name=required(body?.name,'Tên KPI'),unit=required(body?.unit,'Đơn vị');const evaluationDirection=String(body?.evaluationDirection||''),inputMode=String(body?.inputMode||'manual');if(!DIRECTIONS.has(evaluationDirection))throw new HttpError('Chiều đánh giá không hợp lệ.',400,'REPORT_KPI_DIRECTION_INVALID');if(!INPUT_MODES.has(inputMode))throw new HttpError('Nguồn dữ liệu KPI không hợp lệ.',400,'REPORT_KPI_INPUT_MODE_INVALID');const formulaCode=inputMode==='derived'?required(body?.formulaCode,'Công thức'):null;return{name,unit,evaluationDirection,inputMode,formulaCode};};
module.exports={
  list:query=>repository.list(query?.team?team(query.team):null),
  async create(body,userId){const result=await repository.create({teamCode:team(body?.teamCode),...payload(body),userId});if(!result)throw new HttpError('Không tìm thấy bộ phận.',404,'REPORT_TEAM_NOT_FOUND');return result;},
  async update(id,body,userId){const result=await repository.update(id,{...payload(body),isActive:body?.isActive===undefined?undefined:Boolean(body.isActive),userId});if(!result)throw new HttpError('Không tìm thấy KPI.',404,'REPORT_KPI_NOT_FOUND');return result;},
  async reorder(body,userId){const ids=Array.isArray(body?.ids)?body.ids.map(String):[];if(!ids.length)throw new HttpError('Danh sách KPI không hợp lệ.',400,'REPORT_KPI_ORDER_INVALID');const result=await repository.reorder(team(body?.teamCode),ids,userId);if(!result)throw new HttpError('Không tìm thấy bộ phận.',404,'REPORT_TEAM_NOT_FOUND');if(result.conflict)throw new HttpError('Danh sách KPI không khớp cấu hình hiện tại.',409,'REPORT_KPI_ORDER_CONFLICT');return result;}
};
