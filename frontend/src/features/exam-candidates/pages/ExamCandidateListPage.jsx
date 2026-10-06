import React,{useCallback,useEffect,useRef,useState}from'react';
import{ChevronLeft,ChevronRight,Download,RefreshCw,Search,Users}from'lucide-react';
import{Button,Combobox,IconButton}from'../../../components/ui';
import{exportExamCandidates,getExamCandidateFilterOptions,listExamCandidates}from'../../../services/examCandidateService';
import'./ExamCandidateListPage.css';
import'./ExamCandidateListState.css';

const toeicLabels={NEVER_STUDIED:'Chưa học',STUDIED_NOT_TESTED:'Đã học nhưng chưa thi',TOOK_TOEIC:'Đã thi TOEIC',OTHER_CERTIFICATE:'Đã học/thi chứng chỉ khác'};
const statusLabels={REGISTERED:'Chưa thi',IN_PROGRESS:'Đang làm bài',SUBMITTED:'Đã nộp bài',EXPIRED:'Hết giờ',CANCELLED:'Đã hủy'};
const date=value=>value?new Date(value).toLocaleString('vi-VN',{hour12:false,hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'}):'—';
const initials=name=>String(name||'TS').split(/\s+/).filter(Boolean).slice(-2).map(word=>word[0]).join('').toUpperCase();

export default function ExamCandidateListPage({showMsg,canExport=false}){
  const[searchInput,setSearchInput]=useState('');
  const[filters,setFilters]=useState({search:'',eventIds:'',toeicExperiences:'',attemptStatuses:'',schools:'',page:1,limit:10});
  const[result,setResult]=useState({data:[],meta:{page:1,limit:10,total:0,totalPages:1}});
  const[options,setOptions]=useState({events:[],schools:[],toeicExperiences:[],attemptStatuses:[]});
  const[loading,setLoading]=useState(true);const[exporting,setExporting]=useState(false);const[loadError,setLoadError]=useState('');
  const showMsgRef=useRef(showMsg);useEffect(()=>{showMsgRef.current=showMsg;},[showMsg]);
  const load=useCallback(async()=>{setLoading(true);setLoadError('');try{setResult(await listExamCandidates(filters));}catch(error){const message=error.response?.data?.error||'Không thể kết nối máy chủ để tải danh sách thí sinh.';setLoadError(message);showMsgRef.current?.(message,'error');}finally{setLoading(false);}},[filters]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{getExamCandidateFilterOptions().then(setOptions).catch(()=>setOptions({events:[],schools:[],toeicExperiences:[],attemptStatuses:[]}));},[]);
  useEffect(()=>{const timer=setTimeout(()=>setFilters(current=>({...current,search:searchInput.trim(),page:1})),300);return()=>clearTimeout(timer);},[searchInput]);
  const update=(key,value)=>setFilters(current=>({...current,[key]:value,...(key!=='page'?{page:1}:{})}));
  const reset=()=>{setSearchInput('');setFilters(current=>({...current,search:'',eventIds:'',toeicExperiences:'',attemptStatuses:'',schools:'',page:1}));};
  const download=async()=>{try{setExporting(true);const blob=await exportExamCandidates(filters);const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`danh-sach-thi-sinh-${new Date().toISOString().slice(0,10)}.xlsx`;link.click();URL.revokeObjectURL(url);}catch(error){showMsg?.(error.response?.data?.error||'Không thể xuất danh sách thí sinh.','error');}finally{setExporting(false);}};
  const meta=result.meta||{};const rows=result.data||[];
  const withAll=(label,items)=>[{value:'',label},...(items||[])];
  return <section className="candidate-list-page">
    <header className="candidate-list-header"><nav><span>Quản lý kỳ thi</span><i>/</i><strong>Danh sách thí sinh</strong></nav></header>
    <main className="candidate-list-main">
      <section className="candidate-list-toolbar"><label className="candidate-list-search"><Search/><input value={searchInput} onChange={event=>setSearchInput(event.target.value)} placeholder="Tìm tên, SBD, email, số điện thoại..."/></label>
        <Combobox value={filters.eventIds} onChange={value=>update('eventIds',value)} options={withAll('Kỳ thi (Tất cả)',options.events)} placeholder="Kỳ thi (Tất cả)" searchable loading={loading&&!options.events.length}/>
        <Combobox value={filters.toeicExperiences} onChange={value=>update('toeicExperiences',value)} options={withAll('Tình trạng học TOEIC (Tất cả)',options.toeicExperiences)} placeholder="Tình trạng học TOEIC" searchable={false}/>
        <Combobox value={filters.attemptStatuses} onChange={value=>update('attemptStatuses',value)} options={withAll('Trạng thái thi (Tất cả)',options.attemptStatuses)} placeholder="Trạng thái thi" searchable={false}/>
        <Combobox value={filters.schools} onChange={value=>update('schools',value)} options={withAll('Trường / Đơn vị (Tất cả)',options.schools)} placeholder="Trường / Đơn vị" searchable loading={loading&&!options.schools.length}/>
        <div className="candidate-list-actions"><IconButton size="sm" className="refresh" onClick={reset} title="Làm mới bộ lọc" aria-label="Làm mới bộ lọc"><RefreshCw/></IconButton>{canExport&&<Button size="sm" variant="outline" className="export" icon={<Download/>} onClick={download} loading={exporting}>{exporting?'Đang xuất...':'Xuất Excel'}</Button>}</div>
      </section>
      <section className="candidate-list-card"><div className="candidate-list-scroll"><table><thead><tr><th>HỌ VÀ TÊN THÍ SINH</th><th>SỐ ĐIỆN THOẠI</th><th>EMAIL</th><th>TRƯỜNG / ĐƠN VỊ</th><th>NĂM SINH</th><th>TÌNH TRẠNG HỌC TOEIC</th><th>KỲ THI</th><th>ĐỀ THI</th><th>BẮT ĐẦU LÀM BÀI</th><th className="right">ĐIỂM GỐC</th></tr></thead><tbody>{loading?<tr><td colSpan="10" className="candidate-list-empty"><span className="candidate-loading"/><strong>Đang tải danh sách...</strong></td></tr>:loadError?<tr><td colSpan="10" className="candidate-list-empty candidate-list-error"><Users/><strong>Không tải được danh sách thí sinh</strong><small>{loadError}</small><Button size="sm" variant="secondary" icon={<RefreshCw/>} onClick={load}>Thử lại</Button></td></tr>:rows.length===0?<tr><td colSpan="10" className="candidate-list-empty"><Users/><strong>Chưa có thí sinh phù hợp</strong></td></tr>:rows.map((row,index)=><tr key={row.id}><td><div className={`candidate-name color-${index%6}`}><i>{initials(row.fullName)}</i><span><strong>{row.fullName}</strong><small>SBD: {row.candidateNumber}</small></span></div></td><td>{row.phone||'—'}</td><td className="truncate">{row.email||'—'}</td><td>{row.schoolName||'—'}</td><td>{row.birthYear||'—'}</td><td><span className={`candidate-toeic is-${String(row.toeicExperience||'none').toLowerCase()}`}>{toeicLabels[row.toeicExperience]||'—'}</span></td><td><div className="candidate-event"><strong>{row.event.name}</strong><small>{row.event.eventCode}</small></div></td><td>{row.exam.title}</td><td><div className="candidate-attempt"><strong className={`is-${String(row.attempt.status).toLowerCase()}`}>{statusLabels[row.attempt.status]||row.attempt.status}</strong><small>{date(row.attempt.startedAt)}</small></div></td><td className="right"><b>{row.attempt.totalScore??'—'}</b></td></tr>)}</tbody></table></div>
        <footer><span>Tổng số: <b>{meta.total||0}</b> thí sinh</span><div><label>Hiển thị <select value={filters.limit} onChange={event=>update('limit',Number(event.target.value))}><option value="10">10</option><option value="20">20</option><option value="50">50</option></select> / trang</label><IconButton size="sm" aria-label="Trang trước" disabled={(meta.page||1)<=1} onClick={()=>update('page',(meta.page||1)-1)}><ChevronLeft/></IconButton><b>{meta.page||1} / {meta.totalPages||1}</b><IconButton size="sm" aria-label="Trang sau" disabled={(meta.page||1)>=(meta.totalPages||1)} onClick={()=>update('page',(meta.page||1)+1)}><ChevronRight/></IconButton></div></footer>
      </section>
    </main>
  </section>;
}
