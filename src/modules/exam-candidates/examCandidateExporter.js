const XLSX=require('xlsx');
const service=require('./examCandidateService');
const fmt=value=>value?new Date(value).toLocaleString('vi-VN',{hour12:false}):'';
async function create(filters){
  const result=await service.list({...filters,page:1,limit:10000,__export:true});
  const rows=result.data.map((row,index)=>({
    'STT':index+1,'SBD':row.candidateNumber,'Họ và tên':row.fullName,
    'Số điện thoại':row.phone,'Email':row.email,'Trường / Đơn vị':row.schoolName,
    'Năm sinh':row.birthYear??'','Tình trạng học TOEIC':service.TOEIC_LABELS[row.toeicExperience]||'',
    'Kỳ thi':row.event.name,'Mã kỳ thi':row.event.eventCode,'Đề thi':row.exam.title,
    'Trạng thái thi':service.STATUS_LABELS[row.attempt.status]||row.attempt.status,
    'Bắt đầu làm bài':fmt(row.attempt.startedAt),'Nộp bài':fmt(row.attempt.submittedAt),
    'Điểm gốc':row.attempt.totalScore??''
  }));
  const workbook=XLSX.utils.book_new();const sheet=XLSX.utils.json_to_sheet(rows);
  sheet['!cols']=[{wch:6},{wch:20},{wch:28},{wch:16},{wch:30},{wch:28},{wch:10},{wch:26},{wch:38},{wch:22},{wch:36},{wch:18},{wch:22},{wch:22},{wch:12}];
  XLSX.utils.book_append_sheet(workbook,sheet,'Danh sách thí sinh');
  return XLSX.write(workbook,{type:'buffer',bookType:'xlsx'});
}
module.exports={create};
