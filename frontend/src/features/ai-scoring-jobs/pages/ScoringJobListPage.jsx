import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Workflow } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, CodeText, ColumnVisibilityMenu, DataTable, DateRangePicker, DateTimeDisplay, FilterBar, ListPage, MultiSelectFilter, Pagination, ProgressBar, StatusBadge, TableToolbar } from '../../../design-system-v2';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { exportScoringJobs, getScoringJobFacets, listScoringJobs } from '../../../services/aiScoringJobService';
import './ScoringJobListPage.css';

const STATUS_LABEL={ACCEPTED:'Đã tiếp nhận',FETCHING_SOURCE:'Đang lấy dữ liệu',SYNCING_EXAM:'Đang đồng bộ đề',PREPARING_MEDIA:'Chuẩn bị media',VALIDATING:'Kiểm tra dữ liệu',READY_FOR_AI:'Sẵn sàng chấm',QUEUED:'Đang chờ',TRANSCRIBING:'Chuyển giọng nói',EXTRACTING_FEATURES:'Trích xuất đặc trưng',SCORING_QUESTIONS:'Đang chấm câu',AGGREGATING_GROUPS:'Tổng hợp nhóm',CALIBRATING:'Hiệu chỉnh',COMPLETED:'Hoàn tất',COMPLETED_WITH_ISSUES:'Hoàn tất có lỗi',REVIEW_REQUIRED:'Cần kiểm tra',FAILED:'Thất bại',SOURCE_FETCH_FAILED:'Lỗi nguồn',MEDIA_FAILED:'Lỗi media',INVALID_INPUT:'Dữ liệu lỗi',INVALID_REQUEST:'Yêu cầu lỗi',CANCELLED:'Đã hủy'};
const tone=status=>status==='COMPLETED'?'completed':status?.includes('FAILED')||status?.includes('INVALID')?'failed':status==='REVIEW_REQUIRED'||status==='COMPLETED_WITH_ISSUES'?'warning':['ACCEPTED','QUEUED'].includes(status)?'queued':'processing';
const duration=value=>value==null?'—':value<60000?`${Math.max(1,Math.round(value/1000))} giây`:value<3600000?`${Math.round(value/60000)} phút`:`${Math.round(value/360000)/10} giờ`;
const read=(params,key,fallback='')=>params.get(key)||fallback;
const pageEnd=value=>`${value}T23:59:59.999Z`;
const shortId=value=>value?`${value.slice(0,8)}…${value.slice(-4)}`:'—';
const ALL_COLUMN_KEYS=['stt','job','tenant','scope','status','stage','progress','duration','retry','error','acceptedAt'];

export default function ScoringJobListPage({ currentUser, showMsg }) {
  const navigate=useNavigate();
  const [params,setParams]=useSearchParams(); const [search,setSearch]=useState(read(params,'search')); const debounced=useDebouncedValue(search,350);
  const [result,setResult]=useState({items:[],total:0,page:Number(read(params,'page','1')),pageSize:Number(read(params,'pageSize','25'))});
  const [facets,setFacets]=useState({tenants:[],statuses:[],scopes:['S','W','S+W']}); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [exporting,setExporting]=useState(false);
  const [visibleColumnKeys,setVisibleColumnKeys]=useState(ALL_COLUMN_KEYS);
  const query=useMemo(()=>({search:debounced,tenantId:read(params,'tenantId'),status:read(params,'status'),scope:read(params,'scope'),from:read(params,'from'),to:read(params,'to'),hasRetry:read(params,'hasRetry'),page:Number(read(params,'page','1')),pageSize:Number(read(params,'pageSize','25'))}),[debounced,params]);
  const update=useCallback(changes=>setParams(current=>{const next=new URLSearchParams(current);Object.entries(changes).forEach(([key,value])=>value?next.set(key,String(value)):next.delete(key));return next;}),[setParams]);
  useEffect(()=>{if(debounced!==read(params,'search')) update({search:debounced,page:1});},[debounced,params,update]);
  useEffect(()=>{getScoringJobFacets().then(setFacets).catch(()=>{});},[]);
  const load=useCallback(async()=>{setLoading(true);setError('');try{setResult(await listScoringJobs(query));}catch(e){setError(e.response?.data?.error||'Không thể tải danh sách scoring job.');}finally{setLoading(false);}},[query]); useEffect(()=>{load();},[load]);
  const download=async()=>{if(!query.from||!query.to){showMsg?.('Chọn khoảng thời gian trước khi xuất dữ liệu.','error');return;}setExporting(true);try{const response=await exportScoringJobs({...query,page:1,pageSize:5000});const url=URL.createObjectURL(response.data);const a=document.createElement('a');a.href=url;a.download=`ai-scoring-jobs-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);}catch(e){showMsg?.(e.response?.data?.error||'Không thể xuất dữ liệu.','error');}finally{setExporting(false);}};
  const allColumns=useMemo(()=>[
    {key:'stt',label:'STT',align:'center',width:64,render:(_row,index)=>((result.page||1)-1)*(result.pageSize||25)+index+1},
    {key:'job',label:'Job',width:225,render:row=><span className="job-identity"><strong>{row.keycode}</strong><CodeText title={`Job ID: ${row.id}\nScoring ID: ${row.scoringId}`} className="iig3-list-code">{shortId(row.id)}</CodeText></span>},
    {key:'tenant',label:'Tenant',width:160,render:row=>row.tenant?<span className="job-tenant"><strong>{row.tenant.name}</strong><small>{row.tenant.code}</small></span>:<Badge tone="neutral">Dữ liệu cũ</Badge>},
    {key:'scope',label:'Phạm vi',align:'center',width:90,render:row=><Badge tone="info">{row.scope}</Badge>},
    {key:'status',label:'Trạng thái',width:185,render:row=><StatusBadge status={tone(row.status)} label={STATUS_LABEL[row.status]||row.status}/>},
    {key:'stage',label:'Công đoạn hiện tại',width:180,render:row=>STATUS_LABEL[row.stage]||row.stage},
    {key:'progress',label:'Tiến độ',width:165,render:row=><ProgressBar tone={row.status==='COMPLETED'?'success':row.errorCode?'danger':'ai'} value={row.progress.completed} max={row.progress.total||1} showValue label={row.progress.failed?`${row.progress.failed} lỗi`:undefined}/>},
    {key:'duration',label:'Thời lượng',width:105,render:row=>duration(row.durationMs)},
    {key:'retry',label:'Retry',align:'center',width:80,render:row=>row.retryCount?<Badge tone="warning">{row.retryCount}</Badge>:'—'},
    {key:'error',label:'Mã lỗi',width:150,render:row=>row.errorCode?<Badge tone="danger">{row.errorCode}</Badge>:'—'},
    {key:'acceptedAt',label:'Tiếp nhận lúc',width:170,render:row=><DateTimeDisplay value={row.acceptedAt}/>},
  ],[result.page,result.pageSize]);
  const columns=allColumns.filter(column=>visibleColumnKeys.includes(column.key));
  const statusOptions=facets.statuses.map(item=>({value:item.status,label:STATUS_LABEL[item.status]||item.status,count:item.count})); const tenantOptions=facets.tenants.map(item=>({value:item.id,label:item.name})); const scopeOptions=facets.scopes.map(value=>({value,label:value==='S'?'Speaking':value==='W'?'Writing':'Speaking + Writing'}));
  const applied=['tenantId','status','scope','from','to','hasRetry'].filter(key=>read(params,key)).length; const clear=()=>{setSearch('');setParams(new URLSearchParams());};
  const dateRange={from:query.from?.slice(0,10)||'',to:query.to?.slice(0,10)||''};
  return <div className="iig3-list-screen scoring-job-list-page"><ListPage breadcrumb={[{label:'AI Scoring'},{label:'Danh sách scoring job'}]} title="Danh sách scoring job" actions={currentUser?.permissions?.includes('ai_scoring.jobs.export')?<Button size="sm" icon={<Download/>} loading={exporting} onClick={download}>Xuất dữ liệu</Button>:null}
    toolbar={<><TableToolbar title="Tất cả scoring job" count={result.total} loading={loading} view={<ColumnVisibilityMenu columns={allColumns} visibleKeys={visibleColumnKeys} requiredKeys={['job']} onChange={setVisibleColumnKeys}/>}/><FilterBar search={search} onSearch={e=>setSearch(e.target.value)} placeholder="Tìm Job ID, Scoring ID…" loading={loading} appliedCount={applied} onClear={clear} filters={<><MultiSelectFilter label="Tenant" placeholder="Tất cả tenant" searchPlaceholder="Tìm tenant…" options={tenantOptions} value={query.tenantId?[query.tenantId]:[]} onChange={v=>update({tenantId:v.at(-1),page:1})}/><MultiSelectFilter label="Trạng thái" placeholder="Tất cả trạng thái" searchPlaceholder="Tìm trạng thái…" options={statusOptions} value={query.status?[query.status]:[]} onChange={v=>update({status:v.at(-1),page:1})}/><MultiSelectFilter label="Phạm vi" placeholder="Tất cả phạm vi" searchPlaceholder="Tìm phạm vi…" options={scopeOptions} value={query.scope?[query.scope]:[]} onChange={v=>update({scope:v.at(-1),page:1})}/></>} actions={<DateRangePicker {...dateRange} presets={[]} placeholder="Khoảng thời gian" fromLabel="Từ ngày" toLabel="Đến ngày" cancelLabel="Hủy" applyLabel="Áp dụng" onChange={range=>update({from:range.from,to:range.to?pageEnd(range.to):'',page:1})}/>} /></>}
    table={<DataTable ariaLabel="Danh sách scoring job" columns={columns} rows={result.items} rowKey="id" loading={loading} error={error} errorAction={<Button variant="outline" size="sm" icon={<RefreshCw/>} onClick={load}>Thử lại</Button>} emptyIcon={<Workflow/>} emptyTitle="Chưa có scoring job" emptyDescription="Không có job phù hợp với bộ lọc hiện tại." onRowClick={currentUser?.permissions?.includes('ai_scoring.jobs.view_detail')?row=>navigate(`/ai-scoring/jobs/${row.id}`):undefined}/>}
    pagination={<Pagination page={result.page} pageCount={Math.max(1,Math.ceil(result.total/result.pageSize))} pageSize={result.pageSize} total={result.total} loading={loading} pageSizeOptions={[10,25,50,100]} onPage={page=>update({page})} onPageSize={pageSize=>update({pageSize,page:1})}/>} /></div>;
}
