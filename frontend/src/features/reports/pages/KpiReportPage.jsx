import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, CheckCircle2, Clock3, Download, FileSpreadsheet, Gauge, RefreshCw, Search, Target } from 'lucide-react';
import { useNavigate,useSearchParams } from 'react-router-dom';
import api from '../../../services/api';
import { healthScore, healthStatus as health, numberOrNull as num } from '../utils/reportMetrics';
import './KpiReportPage.css';

const now = new Date();
const DETAIL_LABELS = {
  product_name:'Sản phẩm',product_group:'Nhóm sản phẩm',order_count:'Số đơn',revenue:'Doanh thu',monthly_target:'Kế hoạch tháng',previous_revenue:'Tháng trước',
  product_code:'Mã sản phẩm',traffic_source:'Nguồn traffic',budget_target:'KH ngân sách',budget_actual:'NS thực hiện',lead_count:'Lead / Data',qualified_lead_count:'Lead đạt chuẩn',ad_cost:'Chi phí Ads',trend:'Xu hướng',prior_year_revenue:'Cùng kỳ',
  channel_name:'Kênh',followers_current:'Followers kỳ này',followers_previous:'Followers kỳ trước',followers_growth:'Tăng trưởng Followers',reach_current:'Reach kỳ này',reach_previous:'Reach kỳ trước',reach_growth:'% vs TTr Reach',video_views:'View Video',engagement_rate:'Engagement Rate',
  organization_name:'Trường / Đơn vị',organization_type:'Loại trường',region:'Vùng miền',activity_date_text:'Ngày triển khai',activity_days:'Số ngày',workshop_count:'Workshop',reach:'Reach',budget:'Ngân sách',
  course_name:'Khóa học',class_count:'Số lớp',active_student_count:'HV đang đào tạo',student_target:'KH học viên',student_achievement:'% HT KH',new_student_count:'HV mới',completed_student_count:'HV kết thúc',teacher_count:'Số giáo viên',output_rate:'Tỷ lệ đạt đầu ra',upsell_revenue:'Doanh thu học lên',status:'Tình trạng',
  activity_name:'Tên sản phẩm / hoạt động',activity_type:'Loại hoạt động',owner_unit:'Đơn vị phụ trách',cooperating_unit:'Đơn vị phối hợp',next_action:'Kế hoạch kỳ',progress_status:'Tiến độ',actual_end_date:'Ngày hoàn thành',output_url:'Link tài liệu',implementation_result:'Kết quả thực hiện',note:'Ghi chú'
};
const DETAIL_COLUMNS={
  REV:['product_group','product_name','order_count','revenue','monthly_target','previous_revenue','prior_year_revenue','note'],
  ADS:['traffic_source','budget_target','budget_actual','lead_count','order_count','revenue','trend','note'],
  COM:['channel_name','followers_current','followers_previous','followers_growth','reach_current','reach_previous','reach_growth','video_views','engagement_rate','lead_count','revenue','note'],
  TRADE:['organization_name','organization_type','region','activity_date_text','activity_days','workshop_count','reach','lead_count','budget','revenue','note'],
  TRAIN:['course_name','class_count','active_student_count','student_target','student_achievement','new_student_count','completed_student_count','teacher_count','output_rate','upsell_revenue','status','note'],
  PROD:['product_group','activity_name','activity_type','owner_unit','cooperating_unit','next_action','implementation_result','progress_status','actual_end_date','output_url','note']
};
const ADS_PRODUCT_COLUMNS=['product_group','product_name','ad_cost','revenue','lead_count','order_count','note'];
const detailValue=(row,key)=>key==='followers_growth'?(Number(row.followers_previous)?(Number(row.followers_current||0)-Number(row.followers_previous))/Number(row.followers_previous):null):key==='reach_growth'?(Number(row.reach_previous)?(Number(row.reach_current||0)-Number(row.reach_previous))/Number(row.reach_previous):null):key==='student_achievement'?(Number(row.student_target)?Number(row.active_student_count||0)/Number(row.student_target):null):row[key];
const PERCENT_DETAIL_KEYS=new Set(['followers_growth','reach_growth','engagement_rate','student_achievement','output_rate']);
const NUMBER_DETAIL_KEYS=new Set(['order_count','revenue','monthly_target','previous_revenue','prior_year_revenue','budget_target','budget_actual','lead_count','qualified_lead_count','ad_cost','followers_current','followers_previous','reach_current','reach_previous','video_views','activity_days','workshop_count','reach','budget','class_count','active_student_count','student_target','new_student_count','completed_student_count','teacher_count','upsell_revenue']);
const percent = value => num(value) === null || !Number.isFinite(num(value)) ? '—' : `${(num(value)*100).toLocaleString('vi-VN',{maximumFractionDigits:1})}%`;
const plainNumber = value => num(value) === null || !Number.isFinite(num(value)) ? '—' : num(value).toLocaleString('vi-VN',{maximumFractionDigits:2});
const metric = (value,unit='') => {
  let number=num(value); if(number===null || !Number.isFinite(number)) return '—';
  if(unit==='Tỷ đồng') number/=1e9; else if(unit==='Triệu đồng') number/=1e6;
  if(unit==='%') return `${(number*100).toLocaleString('vi-VN',{maximumFractionDigits:1})}%`;
  return `${number.toLocaleString('vi-VN',{maximumFractionDigits:number<10?2:1})}${unit?` ${unit}`:''}`;
};
const healthText = status => ({good:'Đạt KH',near:'Tiệm cận',risk:'Cần cải thiện',missing:'Thiếu dữ liệu'}[status]);

function StatusSummary({summary,compact=false}) {
  const total=Math.max(1,summary?.total||0);const cards=[['total',Target,'Tổng KPI theo dõi'],['good',CheckCircle2,'Đạt kế hoạch'],['near',Clock3,'Đang tiệm cận'],['risk',AlertTriangle,'Cần cải thiện']];
  return <section className={`report-health-strip ${compact?'compact':''}`}>{cards.map(([key,Icon,title])=>{const value=summary?.[key]||0;const ratio=key==='total'?100:value/total*100;return <article key={key} className={key}><span className="summary-icon"><Icon/></span><div className="summary-copy"><small>{title}</small><strong>{value}<em>{key==='total'?'chỉ số':`${Math.round(ratio)}%`}</em></strong><div className="summary-meter"><i style={{width:`${ratio}%`}}/></div></div></article>})}</section>;
}
function HorizontalBars({kpis=[]}) {
  return <div className="report-bars">{kpis.map(kpi=>{const score=healthScore(kpi);const status=health(score);return <div key={kpi.code}><span title={kpi.name}>{kpi.name}</span><div className="bar-track"><i className={status} data-value={`${kpi.name}: ${percent(score)}`} style={{width:`${Math.max(0,Math.min((score||0)*100,120))/1.2}%`}}/></div><b>{percent(score)}</b></div>})}</div>;
}
function Donut({summary}) {
  const total=Math.max(1,(summary?.good||0)+(summary?.near||0)+(summary?.risk||0));const good=(summary?.good||0)/total*100;const near=(summary?.near||0)/total*100;
  return <div className="report-donut-wrap"><div className="report-donut" style={{background:`conic-gradient(#12b981 0 ${good}%,#3b82f6 ${good}% ${good+near}%,#ef4444 ${good+near}% 100%)`}}><div><strong>{summary?.total||0}</strong><small>KPI</small></div></div><div className="report-donut-legend"><span><i className="good"/>Đạt ({summary?.good||0})</span><span><i className="near"/>Tiệm cận ({summary?.near||0})</span><span><i className="risk"/>Cần cải thiện ({summary?.risk||0})</span></div></div>;
}
function TrendChart({data=[]}) {
  const [hovered,setHovered]=useState(null);
  const points=Array.from({length:12},(_,index)=>data.find(item=>Number(item.month)===index+1));const plotted=points.map((item,index)=>({x:24+index*48,y:item?120-Math.max(0,Math.min(item.average||0,1.2))*85:120,item}));const available=plotted.filter(point=>point.item);
  return <div className="report-trend">{hovered&&<div className="chart-tooltip" style={{left:`${Math.max(15,Math.min(85,hovered.x/580*100))}%`,top:`${hovered.y/150*100}%`}}><b>Tháng {hovered.month}</b><span>Sức khỏe {percent(hovered.average)}</span><small>{hovered.good||0} đạt · {hovered.near||0} tiệm cận · {hovered.risk||0} rủi ro</small></div>}<svg viewBox="0 0 580 150" role="img" aria-label="Xu hướng mức độ khỏe theo tháng" onMouseLeave={()=>setHovered(null)}><g className="grid"><line x1="24" y1="35" x2="560" y2="35"/><line x1="24" y1="78" x2="560" y2="78"/><line x1="24" y1="120" x2="560" y2="120"/></g>{available.length===1&&<line className="current-level" x1="24" y1={available[0].y} x2="552" y2={available[0].y}/>} {available.slice(0,-1).map((point,index)=>{const next=available[index+1];const gap=Number(next.item.month)-Number(point.item.month)>1;return <line className={`trend-segment ${gap?'has-gap':''}`} key={index} x1={point.x} y1={point.y} x2={next.x} y2={next.y}/>})}{plotted.map(({x,y,item},index)=>item?<circle key={index} cx={x} cy={y} r="6" className={health(item.average)} onMouseEnter={()=>setHovered({x,y,month:index+1,...item})}/>:<circle key={index} cx={x} cy={y} r="3" className="missing-point"/> )}</svg>{available.length===1&&<span className="trend-hint">Đường tham chiếu theo dữ liệu tháng {Number(available[0].item.month)}</span>}<div className="trend-labels">{points.map((_,i)=><span key={i}>T{i+1}</span>)}</div></div>;
}
function HealthGauge({value,label='Sức khỏe KPI'}) {
  const score=Math.max(0,Math.min(num(value)||0,1.2));const angle=(score/1.2)*180;const status=health(value);
  return <div className={`health-gauge ${status}`} title={`${label}: ${percent(value)}`}><div className="gauge-face"><span className="gauge-arc"/><i style={{transform:`rotate(${angle}deg)`}}/><b/></div><strong>{percent(value)}</strong><span>{label}</span><small>{healthText(status)}</small></div>;
}
function Delta({value}) { const change=num(value);if(change===null)return <span className="kpi-delta neutral"><ArrowRight/>Chưa có kỳ trước</span>;const positive=change>=0;return <span className={`kpi-delta ${positive?'up':'down'}`}>{positive?<ArrowUpRight/>:<ArrowDownRight/>}{percent(Math.abs(change))} so với kỳ trước</span>; }
function ReportNotes({note}) {
  const cards=[['highlights','💡','Điểm nổi bật'],['issues','⚠️','Nguyên nhân & vấn đề'],['risks','🚨','Rủi ro & vướng mắc'],['proposals','💡','Đề xuất & kế hoạch']];
  const available=cards.filter(([key])=>note?.[key]);
  return <section className="report-notes"><header><Target/><div><h2>Nhận xét & đề xuất điều hành</h2><small>Nội dung tổng hợp theo kỳ báo cáo</small></div></header>{available.length?<div className="report-note-grid">{available.map(([key,icon,title])=><article className={key} key={key}><strong>{icon} {title}</strong><p>{note[key]}</p></article>)}</div>:<p className="muted">Chưa có nhận xét điều hành cho kỳ này.</p>}{note?.next_month_plan&&<div className="next-month-plan"><b>Kế hoạch tháng tiếp theo</b><p>{note.next_month_plan}</p></div>}</section>;
}

export default function KpiReportPage({currentUser,showMsg}) {
  const navigate=useNavigate();
  const [query]=useSearchParams();const previewPeriodId=query.get('previewPeriodId');const previewTeam=query.get('team');
  const canUpload=currentUser?.permissions?.includes('reports.upload');
  const [bootstrap,setBootstrap]=useState({periods:[],teams:[]});
  const initialTeam=previewTeam&&previewTeam!=='OVERVIEW'?previewTeam:'REV';
  const [year,setYear]=useState(now.getFullYear()); const [month,setMonth]=useState(now.getMonth()+1); const [tab,setTab]=useState(initialTeam);
  const [dashboard,setDashboard]=useState(null); const [trend,setTrend]=useState([]); const [loading,setLoading]=useState(true); const [loadedKey,setLoadedKey]=useState(null);
  const [search,setSearch]=useState('');
  const showMsgRef=useRef(showMsg); const dashboardRequestRef=useRef(0);
  useEffect(()=>{showMsgRef.current=showMsg;},[showMsg]);

  const loadBase=useCallback(async()=>{const base=await api.get('/reports/bootstrap');const data=base.data.data;setBootstrap(data);const selected=previewPeriodId?data.periods.find(item=>String(item.id)===String(previewPeriodId)):data.periods[0];if(selected){setYear(selected.year);setMonth(selected.month);}},[previewPeriodId]);
  const loadDashboard=useCallback(async()=>{const requestKey=`${year}-${month}-${tab}`;const requestId=++dashboardRequestRef.current;setLoading(true);try{const [dashboardResult,trendResult]=await Promise.all([previewPeriodId?api.get(`/reports/manual/periods/${previewPeriodId}/preview/${tab}`):api.get('/reports/dashboard',{params:{year,month,team:tab}}),api.get('/reports/trend',{params:{year,team:tab}})]);if(requestId!==dashboardRequestRef.current)return;setDashboard(dashboardResult.data.data);setTrend(trendResult.data.data);}catch(error){if(requestId!==dashboardRequestRef.current)return;setDashboard(null);setTrend([]);if(error.response?.status!==404)showMsgRef.current(error.response?.data?.error||'Không thể tải báo cáo.','error');}finally{if(requestId===dashboardRequestRef.current){setLoadedKey(requestKey);setLoading(false);}}},[year,month,tab,previewPeriodId]);
  useEffect(()=>{loadBase().catch(()=>showMsgRef.current('Không thể tải cấu hình báo cáo.','error'));},[loadBase]); useEffect(()=>{loadDashboard();},[loadDashboard]);

  const dataKey=`${year}-${month}-${tab}`; const dataIsCurrent=loadedKey===dataKey; const departmentName=bootstrap.teams.find(item=>item.code===tab)?.name; const title=departmentName;
  const kpiSummary=useMemo(()=>{const list=dashboard?.kpis||[];const result={total:list.length,good:0,near:0,risk:0,missing:0,average:null};let sum=0,count=0;list.forEach(kpi=>{const score=healthScore(kpi);const status=health(score);result[status]++;if(score!==null){sum+=Math.min(score,1.2);count++;}});result.average=count?sum/count:null;return result;},[dashboard]);
  const filteredDetails=useMemo(()=>{const query=search.trim().toLowerCase();if(!query)return dashboard?.details||[];return (dashboard?.details||[]).filter(row=>Object.values(row).some(value=>String(value??'').toLowerCase().includes(query)));},[dashboard,search]);
  const detailColumns=useMemo(()=>DETAIL_COLUMNS[tab]||[],[tab]);

  const exportCsv=()=>{if(!filteredDetails.length)return;const columns=detailColumns;const csv=[columns.map(key=>DETAIL_LABELS[key]||key),...filteredDetails.map(row=>columns.map(key=>String(detailValue(row,key)??'').replaceAll('"','""')))].map(row=>row.map(value=>`"${value}"`).join(',')).join('\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv'}));link.download=`bao-cao-${tab.toLowerCase()}-${month}-${year}.csv`;link.click();URL.revokeObjectURL(link.href);};

  return <div className={`report-page ${previewPeriodId?'draft-preview':''}`}>
    {previewPeriodId&&<div style={{padding:'10px 18px',background:'#fff4d6',color:'#8a5600',fontWeight:700,borderRadius:10,marginBottom:12}}>BẢN XEM TRƯỚC · Dữ liệu nháp, chưa được publish</div>}
    <header className="report-header"><div><span className="report-eyebrow">Báo cáo KPI</span><h1>{title} <b>• Tháng {month}/{year}</b></h1><p>Đánh giá sức khỏe KPI, tiến độ thực hiện và dữ liệu chi tiết theo từng mảng.</p></div><div className="report-actions">{canUpload&&<button className="primary" onClick={()=>navigate('/reports/manage')}><FileSpreadsheet/>Nhập dữ liệu báo cáo</button>}<button onClick={()=>window.print()}><Download/>Xuất PDF</button></div></header>
    <section className="report-controls"><div className="report-tabs">{bootstrap.teams.map(item=><button className={tab===item.code?'active':''} onClick={()=>setTab(item.code)} key={item.code}>{item.name}</button>)}</div><div className="report-period"><select value={year} onChange={e=>setYear(Number(e.target.value))}>{[year-1,year,year+1].filter((v,i,a)=>a.indexOf(v)===i).sort().map(item=><option key={item}>{item}</option>)}</select><select value={month} onChange={e=>setMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=><option value={i+1} key={i}>Tháng {i+1}</option>)}</select><button onClick={loadDashboard}><RefreshCw/>Làm mới</button></div></section>

    {loading||!dataIsCurrent?<div className="report-empty"><RefreshCw className="spin"/><p>Đang tổng hợp dashboard…</p></div>:!dashboard?<div className="report-empty"><BarChart3/><h2>Chưa có dữ liệu tháng {month}/{year}</h2><p>Tạo kỳ báo cáo và nhập dữ liệu theo từng bộ phận để hiển thị dashboard.</p></div>:<>
      <section className="team-command"><article><header><div><span>SỨC KHỎE BỘ PHẬN</span><h2>{departmentName}</h2></div><Gauge/></header><HealthGauge value={kpiSummary.average} label="Mức hoàn thành"/></article><div className="summary-command"><header><div><span>PHÂN BỔ KPI</span><h2>Trạng thái thực hiện</h2></div><Activity/></header><StatusSummary summary={kpiSummary} compact/></div><article className="team-trend"><header><div><span>DIỄN BIẾN THEO THÁNG</span><h2>Xu hướng hiệu suất</h2></div><Clock3/></header><TrendChart data={trend}/></article></section>
      <section className="section-heading"><div><span>CHỈ SỐ THÀNH PHẦN</span><h2>Hiệu suất từng KPI</h2></div><small>{dashboard.kpis.length} chỉ số · Cập nhật tháng {month}/{year}</small></section>
      <section className="kpi-scoreboard">{dashboard.kpis.map(kpi=>{const score=healthScore(kpi);const status=health(score);return <article key={kpi.code} className={status}><header><span>{kpi.name}</span><em className={status}>{healthText(status)}</em></header><div className="score-values"><div><small>Thực hiện</small><strong>{metric(kpi.actual_value,kpi.unit)}</strong></div><div><small>Kế hoạch</small><b>{metric(kpi.target_value,kpi.unit)}</b></div></div><div className="score-progress"><span><b>{percent(score)}</b> hoàn thành</span><div className="mini-progress"><i className={status} style={{width:`${Math.min((score||0)*100,100)}%`}}/></div></div><Delta value={kpi.vs_previous}/></article>})}</section>
      <section className="report-chart-grid redesigned"><article className="performance-chart"><header><div><BarChart3/><h2>Mức độ hoàn thành KPI</h2></div><span>Mốc chuẩn 100%</span></header><HorizontalBars kpis={dashboard.kpis}/></article><article className="composition-chart"><header><div><Activity/><h2>Cơ cấu chất lượng</h2></div></header><Donut summary={kpiSummary}/></article></section>
      <ReportNotes note={dashboard.note}/>
      <section className="report-details"><header><div><h2>Chi tiết dữ liệu</h2><small>{departmentName} · {filteredDetails.length} dòng dữ liệu</small></div><div className="table-actions"><div className="report-table-search"><Search/><input aria-label="Tìm kiếm trong bảng" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm kiếm trong bảng…"/></div><button onClick={exportCsv}><Download/>Xuất CSV</button></div></header><div className="report-table-wrap"><table><thead><tr><th className="row-number">#</th>{detailColumns.map(key=><th key={key}>{DETAIL_LABELS[key]||key}</th>)}</tr></thead><tbody>{filteredDetails.map((row,index)=><tr key={row.id||row.row_key||index}><td className="row-number">{index+1}</td>{detailColumns.map(key=>{const value=detailValue(row,key);return <td key={key} title={String(value??'')}>{PERCENT_DETAIL_KEYS.has(key)?percent(value):NUMBER_DETAIL_KEYS.has(key)?plainNumber(value):value||'—'}</td>})}</tr>)}</tbody></table>{!filteredDetails.length&&<div className="table-empty">Không tìm thấy dữ liệu phù hợp.</div>}</div></section>
      {tab==='ADS'&&dashboard.detailSections?.find(section=>section.key==='adsProducts')?.rows?.length>0&&<section className="report-details secondary-detail"><header><div><h2>Tỷ trọng Ads theo sản phẩm</h2><small>{dashboard.detailSections.find(section=>section.key==='adsProducts').rows.length} dòng phân bổ</small></div></header><div className="report-table-wrap"><table><thead><tr><th className="row-number">#</th>{ADS_PRODUCT_COLUMNS.map(key=><th key={key}>{DETAIL_LABELS[key]||key}</th>)}</tr></thead><tbody>{dashboard.detailSections.find(section=>section.key==='adsProducts').rows.map((row,index)=><tr key={row.id||row.row_key||index}><td className="row-number">{index+1}</td>{ADS_PRODUCT_COLUMNS.map(key=><td key={key}>{NUMBER_DETAIL_KEYS.has(key)?plainNumber(row[key]):row[key]||'—'}</td>)}</tr>)}</tbody></table></div></section>}
    </>}
  </div>;
}
