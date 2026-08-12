const HttpError=require('../../http/httpError');
const repository=require('./detailRowConfigRepository');
const {DETAIL_ROW_CONFIG}=require('./detailRowConfig');
const team=value=>{const result=String(value||'').toUpperCase();if(!DETAIL_ROW_CONFIG[result])throw new HttpError('Bộ phận không hợp lệ.',400,'REPORT_TEAM_INVALID');return result;};
const required=(value,label)=>{const result=String(value||'').trim();if(!result)throw new HttpError(`${label} là bắt buộc.`,400,'REPORT_DETAIL_ROW_INVALID');return result;};
module.exports={
  list:query=>repository.list(team(query?.team)),
  async create(body){const teamCode=team(body?.teamCode),rowCode=required(body?.rowCode,'Mã dòng').toUpperCase();if(!/^[A-Z0-9_-]{2,80}$/.test(rowCode))throw new HttpError('Mã dòng chỉ gồm chữ, số, gạch ngang hoặc gạch dưới.',400,'REPORT_DETAIL_ROW_CODE_INVALID');try{return await repository.create({teamCode,rowCode,rowName:required(body?.rowName,'Tên dòng'),isRequired:Boolean(body?.isRequired)});}catch(error){if(error.code==='23505')throw new HttpError('Mã dòng đã tồn tại trong bộ phận.',409,'REPORT_DETAIL_ROW_DUPLICATE');throw error;}},
  async update(id,body){const result=await repository.update(id,{rowName:required(body?.rowName,'Tên dòng'),isRequired:Boolean(body?.isRequired),isActive:body?.isActive!==false});if(!result)throw new HttpError('Không tìm thấy dòng mẫu.',404,'REPORT_DETAIL_ROW_NOT_FOUND');return result;},
  async reorder(body){const ids=Array.isArray(body?.ids)?body.ids.map(String):[];if(!ids.length)throw new HttpError('Danh sách dòng không hợp lệ.',400,'REPORT_DETAIL_ROW_ORDER_INVALID');const result=await repository.reorder(team(body?.teamCode),ids);if(!result)throw new HttpError('Không tìm thấy bộ phận.',404,'REPORT_TEAM_NOT_FOUND');if(result.conflict)throw new HttpError('Danh sách dòng không khớp cấu hình hiện tại.',409,'REPORT_DETAIL_ROW_ORDER_CONFLICT');return result;}
};
