const n=value=>value===null||value===undefined||value===''?null:Number(value);
const sum=(rows,key)=>rows.reduce((total,row)=>total+(n(row[key])||0),0);
const ratio=(value,base)=>base?value/base:null;
const change=(value,base)=>base?(value-base)/Math.abs(base):null;
const aggregate=(rows,key)=>{const map=new Map();for(const row of rows){const name=String(row[key]||'Khác').trim()||'Khác';if(!map.has(name))map.set(name,{name,organizations:new Set(),workshops:0,reach:0,leads:0,budget:0,revenue:0,events:0});const item=map.get(name);item.organizations.add(String(row.organization_code||row.organization_name||''));item.workshops+=n(row.workshop_count)||0;item.reach+=n(row.reach)||0;item.leads+=n(row.lead_count)||0;item.budget+=n(row.budget)||0;item.revenue+=n(row.revenue)||0;item.events++;}return[...map.values()].map(item=>({...item,organizations:item.organizations.has('')?item.organizations.size-1:item.organizations.size,costPerLead:ratio(item.budget,item.leads)}));};

function buildTradeDashboard(dashboard){
  const rows=dashboard?.details||[],kpis=dashboard?.kpis||[],kpi=code=>kpis.find(item=>item.code===code)||{};
  const organizations=new Set(rows.map(row=>String(row.organization_code||row.organization_name||'').trim()).filter(Boolean)).size,workshops=sum(rows,'workshop_count'),reach=sum(rows,'reach'),leads=sum(rows,'lead_count'),budget=sum(rows,'budget'),revenue=sum(rows,'revenue');
  const metric=(code,value)=>({value,previous:n(kpi(code).previous_value),change:change(value,n(kpi(code).previous_value))});
  const regions=aggregate(rows,'region').sort((a,b)=>b.leads-a.leads),activities=aggregate(rows,'activity_type').sort((a,b)=>b.revenue-a.revenue);
  const events=rows.map(row=>({id:row.id||row.row_key,name:row.organization_name||'Hoạt động',type:row.activity_type||'Khác',region:row.region||'Khác',date:row.activity_date_text||'',budget:n(row.budget)||0,revenue:n(row.revenue)||0,leads:n(row.lead_count)||0,reach:n(row.reach)||0,workshops:n(row.workshop_count)||0}));
  const costly=[...regions].filter(item=>item.leads>0).sort((a,b)=>b.costPerLead-a.costPerLead)[0],missing=events.filter(item=>item.revenue===0&&item.workshops>0),leader=regions[0];
  const insights=[costly&&{tone:'danger',title:`${costly.name} có chi phí/lead cao nhất`,detail:`Chi phí trung bình ${Math.round(costly.costPerLead).toLocaleString('vi-VN')} đ/lead.`},missing.length&&{tone:'warning',title:`${missing.length} workshop chưa cập nhật doanh thu`,detail:'Cần kiểm tra và cập nhật để bảo đảm số liệu chính xác.'},leader&&{tone:'success',title:`${leader.name} đóng góp ${Math.round(ratio(leader.leads,leads)*100)}% tổng lead`,detail:`Đạt ${leader.leads.toLocaleString('vi-VN')}/${leads.toLocaleString('vi-VN')} lead trong kỳ.`}].filter(Boolean);
  return{period:dashboard.period,metrics:{organizations:metric('TRADE_03',organizations),workshops:metric('TRADE_05',workshops),reach:metric('TRADE_07',reach),leads:metric('TRADE_08',leads),budget:metric('TRADE_09',budget),revenue:metric('TRADE_10',revenue)},regions,activities,events,insights};
}
module.exports={buildTradeDashboard};
