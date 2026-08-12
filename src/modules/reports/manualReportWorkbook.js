const crypto = require('crypto');
const XLSX = require('xlsx');
const HttpError = require('../../http/httpError');
const {parseDeploymentDate}=require('./reportDateFormat');

const TEMPLATE_VERSION = 'IIG-MANUAL-REPORT-1';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const DETAIL_ENTRY_ROWS = 20;
const KPI_HEADERS = ['Mã KPI','Tên KPI','Đơn vị','Chiều đánh giá','Kế hoạch','Thực hiện','Ghi chú'];
const NOTE_ROWS = [
  ['highlights','Điểm nổi bật'],
  ['issues','Nguyên nhân / vấn đề'],
  ['risks','Rủi ro / vướng mắc'],
  ['proposals','Đề xuất / kế hoạch tháng tới']
];
const DIRECTION_LABEL = {increase_good:'Tăng tốt',decrease_good:'Giảm tốt',monitor:'Theo dõi'};
const ADS_PRODUCT_FIELDS = [
  ['product_group','Nhóm sản phẩm','select','product_group'],
  ['product_name','Sản phẩm','text',null,true],
  ['ad_cost','Chi phí Ads','number'],
  ['revenue','Doanh thu','number'],
  ['note','Ghi chú','text']
];
const INTEGER_FIELDS = new Set([
  'order_count','lead_count','qualified_lead_count','followers_current','followers_previous',
  'reach_current','reach_previous','video_views','engagement_count','class_count',
  'active_student_count','student_target','new_student_count','completed_student_count',
  'qualified_student_count','teacher_count','started_class_count','completed_class_count',
  'workshop_count','social_post_count','target_quantity','actual_quantity'
]);

const normalize = value => String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]+/g,' ' ).trim();
const inputFields = fields => fields.filter(field => field[2] !== 'computed');
const safeCell = value => value === null || value === undefined ? '' : value;
const numericCell=value=>{
  if(value===null||value===undefined||value==='')return '';
  if(typeof value==='number')return value;
  const text=String(value).trim();
  return /^-?\d+\.\d+$/.test(text)?text.replace('.',','):text;
};
const padDatePart=value=>String(value).padStart(2,'0');
const parseDate = value => {
  if(value === null || value === undefined || value === '') return null;
  if(typeof value === 'number') {
    const date=XLSX.SSF.parse_date_code(value);
    return date?`${date.y}-${padDatePart(date.m)}-${padDatePart(date.d)}`:null;
  }
  if(value instanceof Date&&!Number.isNaN(value.getTime()))return value.toISOString().slice(0,10);
  const text=String(value).trim();
  const iso=text.match(/^(\d{4}-\d{2}-\d{2})/);
  if(iso)return iso[1];
  const date=new Date(text);
  return Number.isNaN(date.getTime())?null:date.toISOString().slice(0,10);
};
const parseNumber = value => {
  if(value === null || value === undefined || value === '') return null;
  if(typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  const text = String(value).trim().replace(/\s/g,'');
  if(!text) return null;
  if(!/^-?(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d+)?$/.test(text))return null;
  const normalizedValue=text.replaceAll('.','').replace(',','.');
  return Number.isFinite(Number(normalizedValue)) ? normalizedValue : null;
};
const parseFieldNumber = (value,fieldKey) => {
  const number=parseNumber(value);
  // Excel configured with a comma-decimal locale can store "6,786" as 6.786.
  // Count fields are integers, so restore the intended thousands value on import.
  if(typeof value==='number'&&INTEGER_FIELDS.has(fieldKey)&&number!==null&&!Number.isInteger(Number(number)))return String(Math.round(Number(number)*1000));
  return number;
};

function styleSheet(sheet, widths, editableColumns = [], headerRows = [5]) {
  sheet['!cols'] = widths.map(width => ({wch:width}));
  sheet['!freeze'] = {xSplit:0,ySplit:headerRows[0]+1};
  const range = XLSX.utils.decode_range(sheet['!ref']);
  for(let row=range.s.r;row<=range.e.r;row++) for(let col=range.s.c;col<=range.e.c;col++) {
    const cell=sheet[XLSX.utils.encode_cell({r:row,c:col})];if(!cell)continue;
    cell.s={font:{name:'Arial',sz:10,color:{rgb:'1F2937'}},alignment:{vertical:'center',wrapText:true}};
    if(row===0)cell.s={fill:{fgColor:{rgb:'163A63'}},font:{name:'Arial',sz:14,bold:true,color:{rgb:'FFFFFF'}},alignment:{vertical:'center'}};
    if(headerRows.includes(row))cell.s={fill:{fgColor:{rgb:'DCE6F5'}},font:{name:'Arial',sz:10,bold:true,color:{rgb:'163A63'}},alignment:{vertical:'center',wrapText:true}};
    if(row>headerRows[0]&&editableColumns.includes(col)&&!headerRows.includes(row))cell.s={...cell.s,fill:{fgColor:{rgb:'FFF4CC'}}};
  }
  sheet['!rows']=[{hpt:26},{hpt:20},{hpt:20},{hpt:20},{hpt:8},{hpt:28}];
}

function addMetadata(rows, workspace, title) {
  rows.push([title]);
  rows.push([`Template: ${TEMPLATE_VERSION}`]);
  rows.push([`Bộ phận: ${workspace.team_code}`]);
  rows.push([`Kỳ: ${workspace.month}/${workspace.year}`]);
  rows.push([]);
}

function formatNumericColumns(sheet, headerRow, fields, lastRow) {
  fields.forEach((field,column)=>{
    if(field[2]!=='number')return;
    for(let row=headerRow+1;row<=lastRow;row++){
      const address=XLSX.utils.encode_cell({r:row,c:column});
      const cell=sheet[address];
      if(cell)cell.z='#,##0.############################';
    }
  });
}

function formatInputColumns(sheet, headerRow, fields, lastRow) {
  fields.forEach((field,column)=>{
    const headerAddress=XLSX.utils.encode_cell({r:headerRow,c:column});
    const headerCell=sheet[headerAddress];
    if(field[2]==='date_text'&&headerCell)headerCell.c=[{a:'IIG Admin',t:'Nhập một ngày DD/MM/YYYY; khoảng DD/MM/YYYY - DD/MM/YYYY; hoặc nhiều ngày phân cách bằng dấu chấm phẩy.'}];
    if(field[2]==='date'&&headerCell)headerCell.c=[{a:'IIG Admin',t:'Nhập ngày theo định dạng DD/MM/YYYY.'}];
    if(!['date_text','date'].includes(field[2]))return;
    for(let row=headerRow+1;row<=lastRow;row++){
      const address=XLSX.utils.encode_cell({r:row,c:column});
      const cell=sheet[address]||(sheet[address]={t:'s',v:''});
      cell.z=field[2]==='date_text'?'@':'dd/mm/yyyy';
    }
  });
}

function buildSectionRows(title, fields, rows) {
  const result=[[title],fields.map(field=>field[1])];
  rows.forEach(row=>result.push(fields.map(field=>field[2]==='number'?numericCell(row[field[0]]):safeCell(row[field[0]]))));
  for(let index=rows.length;index<DETAIL_ENTRY_ROWS;index++)result.push(fields.map(()=>''));
  return result;
}

function buildTemplate(workspace) {
  const workbook=XLSX.utils.book_new();
  workbook.Props={Title:`Phiếu báo cáo ${workspace.team_name} tháng ${workspace.month}/${workspace.year}`,Company:'IIG Vietnam',Comments:TEMPLATE_VERSION};

  const kpiRows=[];addMetadata(kpiRows,workspace,`PHIẾU KPI — ${workspace.team_name}`);kpiRows.push(KPI_HEADERS);
  workspace.kpis.forEach(kpi=>kpiRows.push([kpi.code,kpi.name,kpi.unit,DIRECTION_LABEL[kpi.evaluation_direction]||'Theo dõi',numericCell(kpi.target_value),kpi.input_mode==='derived'?'':numericCell(kpi.actual_value),safeCell(kpi.note)]));
  const kpiSheet=XLSX.utils.aoa_to_sheet(kpiRows);
  styleSheet(kpiSheet,[14,38,18,20,18,18,34],[4,5,6]);
  for(let row=6;row<kpiRows.length;row++) {
    kpiSheet[`E${row+1}`].z='#,##0.############################';
    if(kpiSheet[`F${row+1}`])kpiSheet[`F${row+1}`].z='#,##0.############################';
    if(workspace.kpis[row-6]?.input_mode==='derived') {
      const cell=kpiSheet[`F${row+1}`]||(kpiSheet[`F${row+1}`]={t:'s',v:''});
      cell.c=[{a:'IIG Admin',t:'Chỉ số này được hệ thống tự tính từ sheet Chi tiết. Không nhập giá trị tại đây.'}];
    }
  }
  XLSX.utils.book_append_sheet(workbook,kpiSheet,'KPI');

  const fields=inputFields(workspace.config.fields.map(field=>[field.key,field.label,field.type,field.lookup,field.required]));
  const detailRows=[];addMetadata(detailRows,workspace,`DỮ LIỆU CHI TIẾT — ${workspace.config.title}`);detailRows.push(fields.map(field=>field[1]));
  workspace.details.forEach(row=>detailRows.push(fields.map(field=>field[2]==='number'?numericCell(row[field[0]]):safeCell(row[field[0]]))));
  for(let index=workspace.details.length;index<DETAIL_ENTRY_ROWS;index++)detailRows.push(fields.map(()=>''));
  if(workspace.team_code==='ADS') {
    detailRows.push([],...buildSectionRows('PHÂN BỔ ADS THEO SẢN PHẨM',ADS_PRODUCT_FIELDS,workspace.adsProducts||[]));
  }
  const detailSheet=XLSX.utils.aoa_to_sheet(detailRows);
  const primaryWidths=fields.map(field=>field[2]==='text'?32:['date','date_text'].includes(field[2])?24:20);
  const secondaryHeader=workspace.team_code==='ADS'?detailRows.findIndex(row=>normalize(row?.[0])===normalize(ADS_PRODUCT_FIELDS[0][1])):-1;
  const detailWidths=Array.from({length:Math.max(primaryWidths.length,workspace.team_code==='ADS'?ADS_PRODUCT_FIELDS.length:0)},(_,index)=>Math.max(primaryWidths[index]||0,workspace.team_code==='ADS'?(ADS_PRODUCT_FIELDS[index]?.[2]==='text'?32:20):0));
  styleSheet(detailSheet,detailWidths,detailWidths.map((_,index)=>index),secondaryHeader>=0?[5,secondaryHeader]:[5]);
  formatNumericColumns(detailSheet,5,fields,workspace.team_code==='ADS'?secondaryHeader-3:detailRows.length-1);
  formatInputColumns(detailSheet,5,fields,workspace.team_code==='ADS'?secondaryHeader-3:detailRows.length-1);
  if(secondaryHeader>=0)formatNumericColumns(detailSheet,secondaryHeader,ADS_PRODUCT_FIELDS,detailRows.length-1);
  detailSheet['!autofilter']=undefined;
  XLSX.utils.book_append_sheet(workbook,detailSheet,'Chi tiết');

  const noteRows=[];addMetadata(noteRows,workspace,`NHẬN XÉT — ${workspace.team_name}`);noteRows.push(['Nội dung','Nhập nhận xét']);
  NOTE_ROWS.forEach(([key,label])=>noteRows.push([label,safeCell(workspace.note?.[key])]));
  const noteSheet=XLSX.utils.aoa_to_sheet(noteRows);
  styleSheet(noteSheet,[34,100],[1]);
  noteSheet['!rows']=[{hpt:26},{hpt:20},{hpt:20},{hpt:20},{hpt:8},{hpt:28},...NOTE_ROWS.map(()=>({hpt:64}))];
  XLSX.utils.book_append_sheet(workbook,noteSheet,'Nhận xét');

  return XLSX.write(workbook,{bookType:'xlsx',type:'buffer',cellStyles:true});
}

function rowsOf(sheet) { return XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,raw:true}); }
function metadata(rows) {
  const cells=rows.slice(0,6).flat().map(value=>String(value||''));
  const read=label=>String(cells.find(value=>new RegExp(`^${label}:`,'i').test(value))||'').replace(new RegExp(`^${label}:\\s*`,'i'),'');
  return {version:read('Template'),teamCode:read('Bộ phận'),period:read('Kỳ')};
}
function findHeader(rows, labels, start=0) {
  const wanted=labels.map(normalize);
  return rows.findIndex((row,index)=>index>=start&&wanted.every(label=>(row||[]).map(normalize).includes(label)));
}
function objectRows(rows, headerIndex, fields, stopTitle=null, errors=[],section='Chi tiết') {
  if(headerIndex<0)return [];
  const header=(rows[headerIndex]||[]).map(normalize);
  const indexes=fields.map(field=>header.indexOf(normalize(field[1])));
  const result=[];
  for(let index=headerIndex+1;index<rows.length;index++) {
    const row=rows[index]||[];
    if(stopTitle&&normalize(row[0])===normalize(stopTitle))break;
    if(!row.some(value=>value!==null&&String(value).trim()!==''))continue;
    const item={row_key:crypto.randomUUID()};
    fields.forEach((field,fieldIndex)=>{const value=indexes[fieldIndex]>=0?row[indexes[fieldIndex]]:null;if(field[2]==='number'){item[field[0]]=parseFieldNumber(value,field[0]);if(value!==null&&value!==undefined&&String(value).trim()!==''&&item[field[0]]===null)errors.push(`${section} dòng ${index-headerIndex}: “${value}” tại ${field[1]} sai định dạng số Việt Nam.`);}else if(field[2]==='date_text'){item[field[0]]=value===null?null:parseDeploymentDate(value,XLSX);if(value!==null&&value!==undefined&&String(value).trim()!==''&&!item[field[0]])errors.push(`${section} dòng ${index-headerIndex}: “${value}” tại ${field[1]} phải là một ngày, khoảng ngày hoặc nhiều ngày phân cách bằng dấu chấm phẩy.`);}else item[field[0]]=field[2]==='date'?parseDate(value):value===null?null:String(value).trim();});
    result.push(item);
  }
  return result;
}

function validateLookups(rows, fields, masterData = {}, errors) {
  for (const field of fields) {
    const lookup = field[3];
    if (!lookup || !Array.isArray(masterData?.[lookup])) continue;
    const accepted = new Map(masterData[lookup].flatMap(item => [[normalize(item.code),item.label],[normalize(item.label),item.label]]).filter(([key])=>key));
    rows.forEach((row,index) => {
      const value = row[field[0]];
      if (value === null || !String(value).trim()) return;
      const canonical=accepted.get(normalize(value));
      if (!canonical) errors.push(`Chi tiết dòng ${index+1}: “${value}” không thuộc danh mục ${field[1]}.`);
      else row[field[0]]=canonical;
    });
  }
}

function parseTemplate(buffer, workspace) {
  if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>MAX_FILE_SIZE)throw new HttpError('File trống hoặc vượt quá 10 MB.',400,'REPORT_TEMPLATE_FILE_INVALID');
  let workbook;try{workbook=XLSX.read(buffer,{type:'buffer',cellDates:false});}catch{throw new HttpError('Không thể đọc file Excel.',400,'REPORT_TEMPLATE_PARSE_FAILED');}
  const required=['KPI','Chi tiết','Nhận xét'];const missing=required.filter(name=>!workbook.Sheets[name]);
  if(missing.length)throw new HttpError(`Thiếu sheet: ${missing.join(', ')}.`,400,'REPORT_TEMPLATE_SHEETS_MISSING');
  const kpiRows=rowsOf(workbook.Sheets.KPI),detailRows=rowsOf(workbook.Sheets['Chi tiết']),noteRows=rowsOf(workbook.Sheets['Nhận xét']);
  const info=metadata(kpiRows);const errors=[];const warnings=[];
  if(info.version!==TEMPLATE_VERSION)errors.push('Phiên bản template không hợp lệ.');
  if(info.teamCode.toUpperCase()!==workspace.team_code)errors.push(`Template thuộc bộ phận ${info.teamCode||'không xác định'}, không phải ${workspace.team_code}.`);
  if(info.period!==`${workspace.month}/${workspace.year}`)errors.push(`Template thuộc kỳ ${info.period||'không xác định'}, không phải ${workspace.month}/${workspace.year}.`);

  const kpiHeader=findHeader(kpiRows,KPI_HEADERS.slice(0,4));const incomingKpis=new Map();
  if(kpiHeader<0)errors.push('Sheet KPI không có đúng hàng tiêu đề.');
  else for(const row of kpiRows.slice(kpiHeader+1)) {
    const code=String(row[0]||'').trim().toUpperCase();if(!code)continue;
    if(incomingKpis.has(code)){errors.push(`Mã KPI ${code} bị trùng.`);continue;}
    const target=parseNumber(row[4]),actual=parseNumber(row[5]);
    if(row[4]!==null&&row[4]!==undefined&&String(row[4]).trim()!==''&&target===null)errors.push(`KPI ${code}: Kế hoạch “${row[4]}” sai định dạng số Việt Nam.`);
    if(row[5]!==null&&row[5]!==undefined&&String(row[5]).trim()!==''&&actual===null)errors.push(`KPI ${code}: Thực hiện “${row[5]}” sai định dạng số Việt Nam.`);
    incomingKpis.set(code,{name:String(row[1]||'').trim(),unit:String(row[2]||'').trim(),direction:String(row[3]||'').trim(),target_value:target,actual_value:actual,note:row[6]===null?null:String(row[6]||'').trim()});
  }
  const kpis=workspace.kpis.map(kpi=>{const value=incomingKpis.get(kpi.code);if(!value){errors.push(`Thiếu KPI ${kpi.code}.`);return kpi;}
    if(normalize(value.name)!==normalize(kpi.name)||normalize(value.unit)!==normalize(kpi.unit)||normalize(value.direction)!==normalize(DIRECTION_LABEL[kpi.evaluation_direction]||'Theo dõi'))errors.push(`Thông tin cấu hình của KPI ${kpi.code} đã bị thay đổi.`);
    return{...kpi,target_value:value.target_value,actual_value:kpi.input_mode==='derived'?kpi.actual_value:value.actual_value,note:value.note};});
  for(const code of incomingKpis.keys())if(!workspace.kpis.some(kpi=>kpi.code===code))warnings.push(`Bỏ qua KPI không thuộc phiếu: ${code}.`);

  const configFields=inputFields(workspace.config.fields.map(field=>[field.key,field.label,field.type,field.lookup,field.required]));
  let detailHeader=findHeader(detailRows,configFields.map(field=>field[1]));
  if(detailHeader<0&&workspace.team_code==='ADS'){
    detailHeader=findHeader(detailRows,configFields.filter(field=>field[0]!=='trend').map(field=>field[1]));
    if(detailHeader>=0)warnings.push('Template Ads phiên bản cũ chưa có cột Xu hướng; hệ thống sẽ để trống trường này.');
  }
  if(detailHeader<0)errors.push('Sheet Chi tiết không có đúng hàng tiêu đề của bộ phận.');
  const details=objectRows(detailRows,detailHeader,configFields,workspace.team_code==='ADS'?'PHÂN BỔ ADS THEO SẢN PHẨM':null,errors,'Chi tiết');
  validateLookups(details,configFields,workspace.masterData,errors);
  let adsProducts=[];
  if(workspace.team_code==='ADS') {
    const productTitle=detailRows.findIndex(row=>normalize(row?.[0])===normalize('PHÂN BỔ ADS THEO SẢN PHẨM'));
    const productHeader=findHeader(detailRows,ADS_PRODUCT_FIELDS.map(field=>field[1]),productTitle+1);
    if(productTitle<0||productHeader<0)errors.push('Sheet Chi tiết thiếu khối Phân bổ Ads theo sản phẩm.');
    else {adsProducts=objectRows(detailRows,productHeader,ADS_PRODUCT_FIELDS,null,errors,'Phân bổ Ads');validateLookups(adsProducts,ADS_PRODUCT_FIELDS,workspace.masterData,errors);}
  }

  const noteHeader=findHeader(noteRows,['Nội dung','Nhập nhận xét']);const note={};
  if(noteHeader<0)errors.push('Sheet Nhận xét không có đúng hàng tiêu đề.');
  else NOTE_ROWS.forEach(([key,label])=>{const row=noteRows.slice(noteHeader+1).find(item=>normalize(item?.[0])===normalize(label));note[key]=row?.[1]===null?'':String(row?.[1]||'').trim();});

  return {kpis,details,adsProducts,note,errors,warnings,summary:{kpis:kpis.length,details:details.length,adsProducts:adsProducts.length,notes:NOTE_ROWS.filter(([key])=>note[key]).length}};
}

module.exports={TEMPLATE_VERSION,MAX_FILE_SIZE,buildTemplate,parseTemplate,parseNumber,parseDate};
