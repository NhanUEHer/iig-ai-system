const XLSX=require('xlsx');
const HEADERS=['STT','Ngày giao dịch','Ngày cập nhật hệ thống','Loại giao dịch','Ngân hàng','Tên tài khoản/thẻ','Số tài khoản/thẻ','Loại tài khoản','Tiền tệ tài khoản','Số tiền giao dịch gốc','Tiền tệ giao dịch gốc','Ghi nợ','Ghi có','Nhóm chi phí','Nhóm chi phí con / Phân bổ','Loại phí','Tính chất chi phí','Keyword nhận diện','Độ tin cậy','Diễn giải','File sao kê nguồn','Trang nguồn','Dòng tham chiếu','Ngày xác nhận import'];
const asDate=value=>{if(!value)return null;if(value instanceof Date)return Number.isNaN(value.getTime())?null:new Date(value);const text=String(value);const parsed=/^\d{4}-\d{2}-\d{2}/.test(text)?new Date(`${text.slice(0,10)}T00:00:00`):new Date(text);return Number.isNaN(parsed.getTime())?null:parsed;};
const asNumber=value=>Number(value||0);
const transactionType=row=>asNumber(row.fee_amount)>0?'Phí giao dịch':asNumber(row.credit_amount)>0?'Ghi có':'Ghi nợ';
function buildTransactionWorkbook(rows){
  const data=[HEADERS,...rows.map((row,index)=>[index+1,asDate(row.transaction_date),asDate(row.posting_date),transactionType(row),row.bank_code,row.account_name,row.account_number_masked,row.account_type,row.account_currency,asNumber(row.original_amount),row.original_currency||row.account_currency||'VND',asNumber(row.debit_amount),asNumber(row.credit_amount),row.expense_category||'Chi phí khác',row.expense_subcategory||'Chưa xác định',row.fee_type||'',row.cost_nature==='fee'?'Phí':'Chi phí trực tiếp',row.matched_keyword||'',row.classification_confidence||'',row.description,row.original_filename,row.source_page||'',row.source_row||'',row.committed_at?new Date(row.committed_at):null])];
  const sheet=XLSX.utils.aoa_to_sheet(data,{cellDates:true});
  sheet['!cols']=[7,16,22,17,13,24,21,17,16,23,23,17,17,24,30,28,19,22,16,65,36,12,16,22].map(wch=>({wch}));
  sheet['!autofilter']={ref:`A1:X${data.length}`};
  for(let row=2;row<=data.length;row++){for(const column of ['B','C'])if(sheet[`${column}${row}`])sheet[`${column}${row}`].z='dd/mm/yyyy';if(sheet[`X${row}`])sheet[`X${row}`].z='dd/mm/yyyy hh:mm';for(const column of ['J','L','M'])if(sheet[`${column}${row}`])sheet[`${column}${row}`].z='#,##0.00';}
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,'Giao dịch');
  return XLSX.write(workbook,{type:'buffer',bookType:'xlsx',cellDates:true,compression:true});
}
module.exports={HEADERS,transactionType,buildTransactionWorkbook};
