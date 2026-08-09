const n=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value);
const sum=(rows,key)=>rows.reduce((total,row)=>total+(n(row[key])||0),0);
const ratio=(a,b)=>n(a)!==null&&n(b)!==null&&Number(b)!==0?Number(a)/Number(b):null;

function calculate(teamCode,rows,manual={}) {
  const result={...manual};
  if(!rows.length)return result;
  // Revenue summary KPI values are entered manually; detail is used for reconciliation.
  if(teamCode==='ADS') { result.ADS_01=sum(rows,'revenue');result.ADS_02=sum(rows,'lead_count');result.ADS_03=sum(rows,'order_count');result.ADS_04=ratio(result.ADS_03,result.ADS_02);result.ADS_05=sum(rows,'budget_actual');result.ADS_06=ratio(result.ADS_05,result.ADS_01);result.ADS_07=ratio(result.ADS_01,result.ADS_03); }
  if(teamCode==='COM') { const fc=sum(rows,'followers_current'),fp=sum(rows,'followers_previous'),reach=sum(rows,'reach_current'),hasEngagementCount=rows.some(row=>n(row.engagement_count)!==null);result.TT_01=fc;result.TT_02=fp?fc/fp-1:null;result.TT_03=reach;result.TT_05=reach?(hasEngagementCount?sum(rows,'engagement_count')/reach:rows.reduce((total,row)=>total+(n(row.engagement_rate)||0)*(n(row.reach_current)||0),0)/reach):null;result.TT_06=sum(rows,'video_views');result.TT_07=sum(rows,'lead_count');result.TT_09=sum(rows,'revenue'); }
  if(teamCode==='TRADE') { result.TRADE_03=new Set(rows.map(r=>String(r.organization_name||'').trim()).filter(Boolean)).size;result.TRADE_04=sum(rows,'activity_days');result.TRADE_05=sum(rows,'workshop_count');result.TRADE_07=sum(rows,'reach');result.TRADE_08=sum(rows,'lead_count');result.TRADE_09=sum(rows,'budget');result.TRADE_10=sum(rows,'revenue');result.TRADE_11=ratio(result.TRADE_09,result.TRADE_10); }
  if(teamCode==='TRAIN') { result.DAO_01=sum(rows,'active_student_count');result.DAO_02=sum(rows,'new_student_count');result.DAO_03=sum(rows,'completed_student_count');result.DAO_06=sum(rows,'class_count');result.DAO_08=sum(rows,'teacher_count');result.DAO_09=sum(rows,'upsell_revenue'); }
  return result;
}

function validateWorkspace(kpis,rows,fields) {
  const errors=[];const warnings=[];
  rows.forEach((row,index)=>fields.filter(field=>field[4]).forEach(field=>{if(row[field[0]]===null||row[field[0]]===undefined||String(row[field[0]]).trim()==='')errors.push(`Dòng ${index+1}: ${field[1]} là bắt buộc.`);}));
  rows.forEach((row,index)=>fields.filter(field=>field[2]==='number').forEach(field=>{const value=n(row[field[0]]);if(value!==null&&value<0)errors.push(`Dòng ${index+1}: ${field[1]} không được âm.`);}));
  kpis.forEach(kpi=>{if(n(kpi.target_value)!==null&&n(kpi.actual_value)===null&&kpi.evaluation_direction!=='monitor')warnings.push(`${kpi.code} chưa có số thực hiện.`);});
  return {errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
}

module.exports={calculate,validateWorkspace};
