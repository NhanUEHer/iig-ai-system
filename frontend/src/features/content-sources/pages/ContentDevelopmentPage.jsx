import {useCallback,useEffect,useMemo,useState} from 'react';
import {ArrowRight,CheckCircle2,ClipboardList,FileSearch,RefreshCw,ScanSearch,Settings2,Sparkles} from 'lucide-react';
import {Link} from 'react-router-dom';
import {listContentSources,listContentTrends,rebuildContentTrends,selectContentTrends} from '../../../services/contentSourceService';
import MaterialBlueprintPanel from './MaterialBlueprintPanel';
import MaterialSettingsPanel from './MaterialSettingsPanel';
import TrendClusters from './TrendClusters';
import './ContentSourcePage.css';
import './ContentDevelopmentPage.css';

export default function ContentDevelopmentPage({showMsg}){
  const [sources,setSources]=useState([]),[trends,setTrends]=useState([]),[meta,setMeta]=useState({}),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[workspace,setWorkspace]=useState('analysis');
  const load=useCallback(async()=>{try{const [sourceResult,trendResult]=await Promise.all([listContentSources({limit:50}),listContentTrends()]);setSources(sourceResult.data||[]);setTrends(trendResult.data||[]);setMeta(trendResult.meta||{});}catch(error){showMsg(error.response?.data?.error||'Không thể tải dữ liệu phát triển học liệu.','error');}finally{setLoading(false);}},[showMsg]);
  useEffect(()=>{load();},[load]);
  const rebuild=async sourceIds=>{setBusy(true);try{const result=await rebuildContentTrends(sourceIds?{sourceIds}:{});setTrends(result.data||[]);setMeta(result.meta||{});showMsg(`Đã tổng hợp ${result.meta?.total||0} cụm từ ${result.meta?.approvedAnalyses||0} nguồn.`);}catch(error){showMsg(error.response?.data?.error||'Không thể tổng hợp xu hướng.','error');}finally{setBusy(false);}};
  const continueWithTrends=async trendIds=>{setBusy(true);try{await selectContentTrends(trendIds);setTrends(current=>current.map(item=>({...item,isSelected:trendIds.includes(item.id)})));setMeta(current=>({...current,selected:trendIds.length}));setWorkspace('settings');showMsg(`Đã chọn ${trendIds.length} xu hướng để cấu hình học liệu.`);}catch(error){showMsg(error.response?.data?.error||'Không thể lưu xu hướng đã chọn.','error');}finally{setBusy(false);}};
  const analyzedSources=useMemo(()=>sources.filter(item=>item.latestAnalysis?.analysis),[sources]);
  const tabs=[['analysis',FileSearch,'Phân tích đề','Hiểu từng nguồn'],['trends',ScanSearch,'Xu hướng','Gộp nhiều nguồn'],['settings',Settings2,'Cấu hình','Chốt tiêu chí'],['blueprints',ClipboardList,'Kế hoạch học liệu','Duyệt để sản xuất']];
  return <div className="content-source-page content-development-page">
    <header className="content-source-header"><div><span>CONTENT INTELLIGENCE</span><h1>Phát triển học liệu</h1><p>Mỗi bước tạo một insight rõ ràng trước khi chuyển sang quyết định tiếp theo.</p></div>{['analysis','trends'].includes(workspace)&&<button disabled={loading} onClick={load}><RefreshCw className={loading?'spin':''}/>Làm mới</button>}</header>
    <nav className="development-workspaces" aria-label="Các bước phát triển học liệu">{tabs.map(([id,Icon,title,description],index)=><button key={id} className={workspace===id?'active':''} onClick={()=>setWorkspace(id)}><b>{index+1}</b><Icon/><span><strong>{title}</strong><small>{description}</small></span></button>)}</nav>
    <main className="development-workspace">
      {workspace==='analysis'&&<><StepIntro step="BƯỚC 1" title="Phân tích nội dung từng đề" description="AI bóc tách câu hỏi, chủ đề, lỗi thí sinh và mức độ chắc chắn từ từng nguồn; nhân viên xác nhận kết quả trước khi gộp." action="Xem xu hướng" onAction={()=>setWorkspace('trends')}/><SourceInsightPanel sources={analyzedSources}/></>}
      {workspace==='trends'&&<><StepIntro step="BƯỚC 2" title="Xác nhận xu hướng từ nhiều nguồn" description="Chọn phạm vi đề cần đối chiếu để tìm nội dung lặp, dạng bài nổi bật và khoảng trống cần bổ sung."/><TrendClusters trends={trends} meta={meta} sources={sources.filter(item=>item.latestAnalysis?.reviewLabel==='APPROVED')} busy={busy} rebuild={rebuild} onContinue={continueWithTrends}/></>}
      {workspace==='settings'&&<><StepIntro step="BƯỚC 3" title="Chốt tiêu chí tạo học liệu" description="Xem nhanh cấu hình đang áp dụng; mở popup khi cần thay đổi kỹ năng, số lượng, độ khó hoặc điều kiện sử dụng insight." action="Tới blueprint" onAction={()=>setWorkspace('blueprints')}/><MaterialSettingsPanel showMsg={showMsg}/></>}
      {workspace==='blueprints'&&<><StepIntro step="BƯỚC 4" title="Duyệt kế hoạch và sản xuất học liệu" description="Kiểm tra AI sẽ tạo những gì, duyệt kế hoạch rồi mới bắt đầu sinh bài tập, đáp án và tài liệu hoàn chỉnh."/><MaterialBlueprintPanel showMsg={showMsg}/></>}
    </main>
  </div>;
}

function StepIntro({step,title,description,action,onAction}){return <div className="workspace-intro"><div><small>{step}</small><h2>{title}</h2><p>{description}</p></div>{action&&<button onClick={onAction}>{action}<ArrowRight/></button>}</div>}

function SourceInsightPanel({sources}){
  const [selectedId,setSelectedId]=useState(null);
  useEffect(()=>{if(!selectedId&&sources[0])setSelectedId(sources[0].id);},[sources,selectedId]);
  const source=sources.find(item=>item.id===selectedId)||sources[0],analysis=source?.latestAnalysis?.analysis||{};
  if(!source)return <section className="step-insight-card card"><div className="step-empty"><FileSearch/><strong>Chưa có đề đã phân tích</strong><span>Nhập ảnh, PDF hoặc văn bản và chạy phân tích AI trước.</span><Link to="/content-sources">Đi tới Nguồn học liệu <ArrowRight/></Link></div></section>;
  const recalled=analysis.recalledItems||[],insights=analysis.sourceInsights||analysis.insights||[],uncertainties=analysis.uncertainties||[],skills=analysis.sourceSummary?.skills||analysis.classification?.skills||[];
  const sourceTitle=source.detectedContent?.title||source.filename||'Nội dung đã nhập',approved=source.latestAnalysis?.reviewLabel==='APPROVED';
  return <section className="source-insight-workspace card">
    <aside><div><strong>Đề đã phân tích</strong><span>{sources.length} nguồn có insight</span></div>{sources.map(item=>{const itemAnalysis=item.latestAnalysis?.analysis||{},itemSkills=itemAnalysis.sourceSummary?.skills||itemAnalysis.classification?.skills||[],itemTitle=item.detectedContent?.title||item.filename||'Nội dung đã nhập';return <button key={item.id} title={itemTitle} className={source.id===item.id?'active':''} onClick={()=>setSelectedId(item.id)}><strong>{itemTitle}</strong><small>{itemSkills.join(' · ')||'Chưa phân loại'}</small><em>{item.latestAnalysis?.reviewLabel==='APPROVED'?'Đã xác nhận':'Cần kiểm tra'}</em></button>})}<Link to="/content-sources">+ Phân tích nguồn mới</Link></aside>
    <div className="source-insight-detail">
      <header><div><span>TỔNG QUAN PHÂN TÍCH</span><h2>{sourceTitle}</h2><p>{analysis.sourceSummary?.exam||analysis.classification?.exam||'TOEIC'} · {skills.join(', ')||'Chưa xác định kỹ năng'}</p></div><div className="source-insight-actions"><b className={approved?'approved':'pending'}>{approved?<CheckCircle2/>:<Sparkles/>}{approved?'Đã xác nhận':'Cần kiểm tra'}</b><Link to={`/content-sources/${source.id}`}>Xem phân tích đầy đủ <ArrowRight/></Link></div></header>
      <div className="source-meta-line"><span>{analysis.examContext?.examDate||'Chưa rõ ngày thi'}</span><span>{analysis.examContext?.examSession||'Chưa rõ ca thi'}</span><span>{recalled.length} câu/phần nhớ lại</span><span>{insights.length} insight</span>{uncertainties.length>0&&<b>{uncertainties.length} điểm cần kiểm tra</b>}</div>
      <div className="source-preview-heading"><div><h3>Nội dung nổi bật</h3><p>Xem nhanh ba tín hiệu đầu tiên; mở trang chi tiết để duyệt đủ từng câu.</p></div><span>{recalled.length} câu · {insights.length} insight</span></div>
      <div className="source-insight-pairs">{recalled.length?recalled.slice(0,3).map((item,index)=>{const recallId=item.id||item.recallId;const insight=insights.find(value=>(value.recallItemIds||value.recalledItemIds||[]).includes(recallId))||insights[index];return <article key={recallId||index}><section><b>{item.skill} · {item.questionNumbers}</b><strong>{item.topic||item.taskType||'Chưa rõ dạng bài'}</strong><p>{item.recalledContent||item.promptRecall}</p></section><span aria-hidden="true"><ArrowRight/></span><section className="paired-insight">{insight?<><b>{insight.confidenceLevel==='HIGH'?'Tin cậy cao':insight.confidenceLevel==='LOW'?'Tin cậy thấp':'Tin cậy trung bình'}</b><strong>{insight.finding}</strong><p>{insight.learnerImplication||insight.implication}</p></>:<p className="muted">Chưa có insight đủ bằng chứng cho câu này.</p>}</section></article>}):<p className="muted">Chưa bóc tách được câu hỏi cụ thể.</p>}</div>
      {uncertainties.length>0&&<div className="source-warning"><strong>Cần kiểm tra thêm</strong><span>{typeof uncertainties[0]==='string'?uncertainties[0]:uncertainties[0]?.description||uncertainties[0]?.detail||uncertainties[0]?.message||'Có thông tin chưa đủ bằng chứng để kết luận.'}</span>{uncertainties.length>1&&<em>+{uncertainties.length-1} điểm khác trong bản phân tích đầy đủ</em>}</div>}
    </div>
  </section>;
}
