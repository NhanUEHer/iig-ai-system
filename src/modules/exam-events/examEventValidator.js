const HttpError=require('../../http/httpError');
const {STATUSES,LIFECYCLE_STATUSES,ALLOWED_IMAGE_MIME_TYPES,MAX_IMAGE_FILE_SIZE}=require('./examEventConstants');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validateEventId(id){if(!UUID.test(String(id||'')))throw new HttpError('Mã định danh kỳ thi không hợp lệ.',400,'INVALID_EVENT_ID');return id;}
function validateListFilters(filters={}){const statuses=String(filters.status||'').split(',').map(value=>value.trim()).filter(Boolean);if(statuses.some(status=>!LIFECYCLE_STATUSES.includes(status)))throw new HttpError('Bộ lọc trạng thái kỳ thi không hợp lệ.',400,'INVALID_LIFECYCLE_STATUS');}
function validateExamEventInput(data,partial=false){
  if(!partial||data.name!==undefined){const name=String(data.name||'').trim();if(!name)throw new HttpError('Tên kỳ thi là bắt buộc.',400,'INVALID_NAME');if(name.length>240)throw new HttpError('Tên kỳ thi không được vượt quá 240 ký tự.',400,'NAME_TOO_LONG');}
  if(data.status!==undefined&&!STATUSES.includes(data.status))throw new HttpError('Trạng thái kỳ thi không hợp lệ.',400,'INVALID_STATUS');
  if(!partial||data.examId!==undefined){if(!UUID.test(String(data.examId||'')))throw new HttpError('Đề thi áp dụng không hợp lệ.',400,'INVALID_EXAM_ID');}
  if(data.eventCode!==undefined&&String(data.eventCode||'').trim()&&!/^[A-Z0-9_-]{3,40}$/i.test(String(data.eventCode).trim()))throw new HttpError('Mã kỳ thi không hợp lệ.',400,'INVALID_EVENT_CODE');
  if(!partial||data.schoolIds!==undefined){const schoolIds=Array.isArray(data.schoolIds)?[...new Set(data.schoolIds)]:[];if(!schoolIds.length)throw new HttpError('Cần chọn ít nhất một đơn vị / trường tổ chức.',400,'SCHOOL_REQUIRED');if(schoolIds.some(id=>!UUID.test(String(id||''))))throw new HttpError('Đơn vị / Trường tổ chức không hợp lệ.',400,'INVALID_SCHOOL_ID');}
  if(data.internalNote!==undefined&&String(data.internalNote||'').length>1000)throw new HttpError('Ghi chú nội bộ không được vượt quá 1000 ký tự.',400,'INTERNAL_NOTE_TOO_LONG');
  if(!partial||data.description!==undefined){const text=String(data.description||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').trim();if(!text)throw new HttpError('Mô tả và giới thiệu kỳ thi là bắt buộc.',400,'DESCRIPTION_REQUIRED');if(String(data.description||'').length>5000)throw new HttpError('Mô tả kỳ thi không được vượt quá 5000 ký tự.',400,'DESCRIPTION_TOO_LONG');}
  if(!partial||data.startAt!==undefined||data.endAt!==undefined){const start=new Date(data.startAt);const end=new Date(data.endAt);if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start)throw new HttpError('Thời gian kết thúc phải sau thời gian bắt đầu.',400,'INVALID_DATE_RANGE');}
}
function hasImageSignature(buffer,mimetype){
  if(!Buffer.isBuffer(buffer))return false;
  if(mimetype==='image/jpeg')return buffer.length>=3&&buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff;
  if(mimetype==='image/png')return buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if(mimetype==='image/webp')return buffer.length>=12&&buffer.subarray(0,4).toString('ascii')==='RIFF'&&buffer.subarray(8,12).toString('ascii')==='WEBP';
  return false;
}
function validateMediaUpload(file){if(!file||!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype))throw new HttpError('Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP.',400,'INVALID_FILE_TYPE');if(Number(file.size)>MAX_IMAGE_FILE_SIZE)throw new HttpError('Ảnh không được vượt quá 10MB.',400,'FILE_TOO_LARGE');if(!hasImageSignature(file.buffer,file.mimetype))throw new HttpError('Nội dung tệp không đúng định dạng ảnh JPG, PNG hoặc WEBP.',400,'INVALID_FILE_CONTENT');}
module.exports={validateExamEventInput,validateMediaUpload,validateEventId,validateListFilters,hasImageSignature};
