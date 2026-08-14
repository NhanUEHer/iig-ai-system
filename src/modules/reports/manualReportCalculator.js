const n=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);
const sum=(rows,key)=>rows.reduce((total,row)=>total+(n(row[key])||0),0);
const ratio=(a,b)=>n(a)!==null&&n(b)!==null&&Number(b)!==0?Number(a)/Number(b):null;
const average=(rows,key)=>{const values=rows.map(row=>n(row[key])).filter(value=>value!==null);return values.length?values.reduce((total,value)=>total+value,0)/values.length:null;};

function calculate(teamCode,rows,manual={}) {
  const result={...manual};
  if(!rows.length)return result;
  if(teamCode==='REV') { result.DT_01=sum(rows,'revenue');result.DT_03=sum(rows,'order_count');result.DT_04=ratio(result.DT_01,result.DT_03); }
  if(teamCode==='ADS') { result.ADS_01=sum(rows,'revenue');result.ADS_02=sum(rows,'lead_count');result.ADS_03=sum(rows,'order_count');result.ADS_04=ratio(result.ADS_03,result.ADS_02);result.ADS_05=sum(rows,'budget_actual');result.ADS_06=ratio(result.ADS_05,result.ADS_01);result.ADS_07=ratio(result.ADS_01,result.ADS_03); }
  if(teamCode==='COM') { const fc=sum(rows,'followers_current'),fp=sum(rows,'followers_previous'),reach=sum(rows,'reach_current');result.TT_01=fc;result.TT_02=ratio(fc-fp,fp);result.TT_03=reach;result.TT_06=sum(rows,'video_views');result.TT_07=sum(rows,'lead_count');result.TT_09=sum(rows,'revenue'); }
  if(teamCode==='TRADE') { const schoolRows=rows.filter(row=>!['Email','Threads','ZBS'].includes(String(row.organization_name||'').trim()));result.TRADE_03=new Set(schoolRows.map(r=>String(r.organization_code||r.organization_name||'').trim()).filter(Boolean)).size;result.TRADE_04=sum(rows,'activity_days');result.TRADE_05=sum(rows,'workshop_count');result.TRADE_07=sum(rows,'reach');result.TRADE_08=sum(rows,'lead_count');result.TRADE_09=sum(rows,'budget');result.TRADE_10=sum(rows,'revenue');result.TRADE_11=ratio(result.TRADE_09,result.TRADE_10); }
  if(teamCode==='TRAIN') { result.DAO_01=sum(rows,'active_student_count');result.DAO_02=sum(rows,'new_student_count');result.DAO_03=sum(rows,'completed_student_count');result.DAO_04=average(rows,'output_rate');result.DAO_06=sum(rows,'class_count');result.DAO_09=sum(rows,'upsell_revenue'); }
  return result;
}

function validateWorkspace(kpis,rows,fields) {
  const errors=[];const warnings=[];
  rows.forEach((row,index)=>fields.filter(field=>field[4]).forEach(field=>{if(row[field[0]]===null||row[field[0]]===undefined||String(row[field[0]]).trim()==='')errors.push(`Dòng ${index+1}: ${field[1]} là bắt buộc.`);}));
  rows.forEach((row,index)=>fields.filter(field=>field[2]==='number').forEach(field=>{const value=n(row[field[0]]);if(value!==null&&value<0)errors.push(`Dòng ${index+1}: ${field[1]} không được âm.`);}));
  rows.forEach((row,index)=>{if(n(row.organic_reach)!==null&&n(row.reach_current)!==null&&n(row.organic_reach)>n(row.reach_current))errors.push(`Dòng ${index+1}: Organic Reach không được lớn hơn tổng Reach.`);if(n(row.qualified_student_count)!==null&&n(row.evaluated_student_count)!==null&&n(row.qualified_student_count)>n(row.evaluated_student_count))errors.push(`Dòng ${index+1}: Học viên đạt đầu ra không được lớn hơn học viên được đánh giá.`);if(n(row.progress_percent)!==null&&n(row.progress_percent)>100)errors.push(`Dòng ${index+1}: % tiến độ phải từ 0 đến 100.`);if(String(row.progress_status||'')==='Hoàn thành'&&!row.actual_end_date)errors.push(`Dòng ${index+1}: Công việc hoàn thành phải có ngày hoàn thành.`);});
  kpis.forEach(kpi=>{if(n(kpi.target_value)!==null&&n(kpi.actual_value)===null&&kpi.evaluation_direction!=='monitor')warnings.push(`${kpi.code} chưa có số thực hiện.`);});
  return {errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
}

function reconcileWorkspace(teamCode,kpis,rows,extraRows=[]) {
  const errors=[];const warnings=[];const kpi=code=>kpis.find(item=>String(item.code).toUpperCase()===code);const differs=(a,b)=>Math.abs(Number(a||0)-Number(b||0))>0.000001;
  if(teamCode==='REV'&&kpi('DT_01')?.target_value!==null&&differs(kpi('DT_01').target_value,sum(rows,'monthly_target')))warnings.push('Tổng KH tháng theo sản phẩm chưa khớp kế hoạch DT_01.');
  if(teamCode==='TRAIN'&&kpi('DAO_01')?.target_value!==null&&differs(kpi('DAO_01').target_value,sum(rows,'student_target')))warnings.push('Tổng KH học viên theo khóa chưa khớp kế hoạch DAO_01.');
  return {errors,warnings};
}

module.exports={calculate,validateWorkspace,reconcileWorkspace};
