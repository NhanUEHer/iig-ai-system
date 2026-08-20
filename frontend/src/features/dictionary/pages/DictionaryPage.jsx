import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpenText, CheckSquare, Clock3, Eye, LibraryBig, Plus, RefreshCw, Save, Search, Sparkles, Square, Trash2, WandSparkles, X } from 'lucide-react';
import { extractDictionaryItems, generateDictionaryCandidates, getDictionaryDetail, getDictionaryHistory, saveDictionaryCandidates } from '../../../services/dictionaryService';
import '../../key-vocab/pages/KeyVocabPage.css';
import '../../key-vocab/pages/LearningMaterialPage.css';
import './DictionaryPage.css';
import './DictionaryPreview.css';

const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function HighlightedPassage({passage,items}) {
  const terms=[...new Set(items.map(v=>String(v||'').trim()).filter(Boolean))].sort((a,b)=>b.length-a.length);
  if(!terms.length)return passage;
  const matcher=new RegExp(`(${terms.map(escape).join('|')})`,'gi');
  return String(passage).split(matcher).map((part,index)=>terms.some(term=>term.toLowerCase()===part.toLowerCase())?<mark key={index}>{part}</mark>:part);
}
function EntryPreview({candidate,passage,onClose}){
  const collocations=candidate.collocations||[],synonyms=candidate.synonyms||[];
  return <div className="dictionary-detail-backdrop" role="presentation" onMouseDown={event=>event.target===event.currentTarget&&onClose()}>
    <article className="dictionary-detail-modal" role="dialog" aria-modal="true" aria-label={`Preview từ ${candidate.canonical||candidate.originalChunk}`}>
      <header className="dictionary-detail-toolbar">
        <div><LibraryBig/><span><strong>Preview từ điển</strong><small>Đối chiếu nội dung với đoạn văn nguồn</small></span></div>
        <button type="button" onClick={onClose} aria-label="Đóng preview"><X/></button>
      </header>
      <section className="dictionary-detail-source">
        <span>Nội dung nguồn · từ đang xem được highlight</span>
        <p><HighlightedPassage passage={passage||''} items={[candidate.originalChunk||candidate.canonical]}/></p>
      </section>
      <header className="dictionary-detail-word">
        <div className="dictionary-detail-title">
          <span className="dictionary-detail-audio"><BookOpenText/></span>
          <strong>{candidate.canonical||candidate.originalChunk}</strong>
          {candidate.partOfSpeech&&<em>{candidate.partOfSpeech}</em>}
          {candidate.ipa&&<span className="dictionary-detail-ipa">/ {String(candidate.ipa).replace(/^\/?|\/?$/g,'')} /</span>}
        </div>
        <p><b>Nghĩa:</b> {candidate.meaningVi||'—'}</p>
      </header>
      <div className="dictionary-detail-content">
        <section><h3><Sparkles/>English meaning:</h3><p>{candidate.meaningEn||'—'}</p></section>
        <section><h3><Sparkles/>Context meaning:</h3><p className="dictionary-detail-label">Câu gốc trong bài:</p><blockquote>“{candidate.originalSentence||'—'}”</blockquote><p className="dictionary-detail-explain">→ {candidate.contextExplanation||'—'}</p></section>
        <section><h3><Sparkles/>Example:</h3><blockquote>“{candidate.exampleEn||'—'}”</blockquote><p className="dictionary-detail-explain">→ {candidate.exampleVi||'—'}</p></section>
        <section><h3><Sparkles/>Collocations:</h3>{collocations.length?<ul>{collocations.map((item,index)=><li key={`${item}-${index}`}>{item}</li>)}</ul>:<p>—</p>}</section>
        <section><h3><Sparkles/>Synonyms:</h3><p>{synonyms.join(', ')||'—'}</p></section>
        <section><h3><Sparkles/>Word family:</h3><p>{candidate.wordFamily||'—'}</p></section>
      </div>
    </article>
  </div>;
}

export default function DictionaryPage({showMsg,currentUser}){
  const navigate=useNavigate();
  const [tab,setTab]=useState('create'),[passage,setPassage]=useState(''),[draft,setDraft]=useState(null),[workspace,setWorkspace]=useState(null),[busy,setBusy]=useState(false),[selected,setSelected]=useState([]),[preview,setPreview]=useState(null);
  const [history,setHistory]=useState([]),[loading,setLoading]=useState(false),[search,setSearch]=useState(''),[page,setPage]=useState(1),[meta,setMeta]=useState({page:1,total:0,totalPages:1});
  const permissions=currentUser?.permissions||[],canGenerate=permissions.some(v=>['dictionary.generate','dictionary.manage'].includes(v)),canSave=permissions.includes('dictionary.manage');
  const loadHistory=useCallback(async()=>{setLoading(true);try{const r=await getDictionaryHistory({page,limit:10,search:search||undefined});setHistory(r.data||[]);setMeta(r.meta);}catch(e){showMsg?.(e.response?.data?.error||'Không thể tải lịch sử.','error');}finally{setLoading(false);}},[page,search,showMsg]);
  useEffect(()=>{if(tab!=='history')return;const timer=setTimeout(loadHistory,250);return()=>clearTimeout(timer);},[tab,loadHistory]);
  const running=workspace?.candidates?.filter(c=>c.status==='generating').length||0;
  useEffect(()=>{if(!workspace?.id||!running)return;const timer=setInterval(async()=>{try{setWorkspace(await getDictionaryDetail(workspace.id));}catch{}},1200);return()=>clearInterval(timer);},[workspace?.id,running]);
  const counts=useMemo(()=>({done:workspace?.candidates?.filter(c=>c.status==='completed').length||0,failed:workspace?.candidates?.filter(c=>c.status==='failed').length||0,total:workspace?.candidates?.length||0}),[workspace]);
  const extractItems=async()=>{setBusy(true);try{setDraft(await extractDictionaryItems(passage));}catch(e){showMsg?.(e.response?.data?.error||'Không thể bóc từ.','error');}finally{setBusy(false);}};
  const setItem=(index,value)=>setDraft(d=>({...d,items:d.items.map((item,i)=>i===index?value:item)}));
  const removeItem=index=>setDraft(d=>({...d,items:d.items.filter((_,i)=>i!==index)}));
  const saveList=async()=>{setBusy(true);try{const result=await saveDictionaryCandidates(draft);setWorkspace(result);setDraft(null);setSelected([]);showMsg?.('Đã lưu danh sách từ. Bạn có thể chọn từ để gen.','success');}catch(e){showMsg?.(e.response?.data?.error||'Không thể lưu danh sách.','error');}finally{setBusy(false);}};
  const openWorkspace=async id=>{try{setWorkspace(await getDictionaryDetail(id));setSelected([]);setTab('create');}catch(e){showMsg?.(e.response?.data?.error||'Không thể mở danh sách.','error');}};
  const toggle=id=>setSelected(values=>values.includes(id)?values.filter(v=>v!==id):[...values,id]);
  const selectable=workspace?.candidates?.filter(c=>c.status!=='generating').map(c=>c.id)||[];
  const toggleAll=()=>setSelected(selected.length===selectable.length?[]:selectable);
  const queue=async ids=>{try{await generateDictionaryCandidates(workspace.id,ids);setWorkspace(await getDictionaryDetail(workspace.id));setSelected(v=>v.filter(id=>!ids.includes(id)));}catch(e){showMsg?.(e.response?.data?.error||'Không thể bắt đầu gen.','error');}};
  const reset=()=>{setWorkspace(null);setDraft(null);setSelected([]);setPassage('');};
  const displayPassage=workspace?.passage||draft?.passage||passage,displayItems=workspace?workspace.candidates.map(c=>c.originalChunk):draft?.items||[];
  return <div className="key-vocab-page learning-material-page dictionary-page">
    <header className="key-vocab-header material-header"><div><span>CONTENT TOOLS · AI ACADEMY</span><h1>Tạo học liệu</h1><p>Bóc, kiểm duyệt và tạo từ điển theo từng từ trong nội dung nguồn.</p></div><div className="key-vocab-tabs"><button className={tab==='create'?'active':''} onClick={()=>setTab('create')}><Sparkles/>Tạo mới</button><button className={tab==='history'?'active':''} onClick={()=>setTab('history')}><Clock3/>Lịch sử</button></div></header>
    {tab==='history'?<section className="key-vocab-history"><header><div><h2>Lịch sử Dictionary</h2><p>{meta.total||0} danh sách đã lưu</p></div><label><Search/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Tìm nội dung nguồn…"/></label></header>{loading?<div className="key-vocab-empty"><RefreshCw className="spin"/>Đang tải…</div>:<div className="key-vocab-table-wrap"><table><thead><tr><th>Nội dung</th><th>Trạng thái</th><th>Số từ</th><th>Người tạo</th><th>Thời gian</th><th/></tr></thead><tbody>{history.map(item=><tr key={item.id}><td><strong>{item.passage}</strong></td><td><span>{item.status}</span></td><td>{item.item_count}</td><td>{item.created_by_name}</td><td>{new Date(item.created_at).toLocaleString('vi-VN')}</td><td><button onClick={()=>openWorkspace(item.id)}><Eye/>Mở</button></td></tr>)}</tbody></table></div>}<footer><span>Trang {meta.page}/{meta.totalPages}</span><div><button disabled={page<=1} onClick={()=>setPage(v=>v-1)}><ArrowLeft/></button><button disabled={page>=meta.totalPages} onClick={()=>setPage(v=>v+1)}><ArrowRight/></button></div></footer></section>
    :<div className="material-create"><section className="material-tools"><button className="material-tool" onClick={()=>navigate('/key-vocab')}><span><BookOpenText/></span><div><strong>Gen Key Vocab</strong><small>Trích xuất từ trọng tâm theo level TOEIC.</small></div></button><button className="material-tool active"><span><LibraryBig/></span><div><strong>Gen Dictionary</strong><small>Kiểm duyệt từ trước, gen nội dung sau.</small></div><em>Đang chọn</em></button></section>
      {!draft&&!workspace?<section className="key-vocab-workspace material-workspace"><div className="key-vocab-editor material-editor"><header><div><LibraryBig/><span><strong>Nội dung nguồn</strong><small>Bước 1 · Bóc danh sách từ/cụm từ.</small></span></div><em>{passage.length} ký tự</em></header><textarea value={passage} onChange={e=>setPassage(e.target.value)} maxLength={20000} placeholder="Dán đoạn văn cần tạo bộ từ điển…"/><footer><span>Tối thiểu 80 ký tự</span><button disabled={!canGenerate||passage.trim().length<80||busy} onClick={extractItems}>{busy?<RefreshCw className="spin"/>:<WandSparkles/>}{busy?'Đang bóc từ…':'Bóc từ với AI'}</button></footer></div><aside><span><Sparkles/></span><h2>Quy trình hai bước</h2><ol><li><b>01</b><div><strong>Bóc & kiểm duyệt</strong><small>Sửa, thêm, xóa và đối chiếu highlight.</small></div></li><li><b>02</b><div><strong>Chọn từ để gen</strong><small>Gen riêng từng từ hoặc chọn nhiều từ.</small></div></li><li><b>03</b><div><strong>Xem ngay kết quả</strong><small>Mục hoàn tất có preview ngay lập tức.</small></div></li></ol></aside></section>
      :draft?<section className="dictionary-review"><header><div><strong>Kiểm duyệt danh sách từ</strong><small>Sửa, thêm hoặc xóa trước khi lưu.</small></div><button onClick={()=>setDraft(d=>({...d,items:[...d.items,'']}))}><Plus/>Thêm từ</button></header><div className="dictionary-review-grid"><article className="dictionary-passage"><span>Nội dung nguồn · từ đã bóc được highlight</span><p><HighlightedPassage passage={displayPassage} items={displayItems}/></p></article><section className="dictionary-draft-list">{draft.items.map((item,index)=><div key={index}><b>{String(index+1).padStart(2,'0')}</b><input value={item} onChange={e=>setItem(index,e.target.value)} placeholder="Nhập từ/cụm từ"/><button onClick={()=>removeItem(index)}><Trash2/></button></div>)}</section></div><footer><button className="secondary" onClick={()=>setDraft(null)}>Quay lại</button><button className="primary" disabled={!canSave||busy||!draft.items.some(v=>v.trim())} onClick={saveList}>{busy?<RefreshCw className="spin"/>:<Save/>}Lưu danh sách từ</button></footer></section>
      :<section className="dictionary-workspace"><header><div><strong>Danh sách từ đã lưu</strong><small>Chọn từ để gen; kết quả hoàn tất có thể xem ngay.</small></div><div><button className="secondary" onClick={reset}>Tạo bộ mới</button><button className="select-all" onClick={toggleAll}>{selected.length===selectable.length&&selectable.length?<CheckSquare/>:<Square/>}Chọn tất cả</button><button className="primary" disabled={!selected.length} onClick={()=>queue(selected)}><WandSparkles/>Gen {selected.length} từ đã chọn</button></div></header><article className="dictionary-passage compact"><span>Nội dung nguồn</span><p><HighlightedPassage passage={displayPassage} items={displayItems}/></p></article><div className="dictionary-candidate-list">{workspace.candidates.map((candidate,index)=><article key={candidate.id} className={candidate.status}><button className="check" disabled={candidate.status==='generating'} onClick={()=>toggle(candidate.id)}>{selected.includes(candidate.id)?<CheckSquare/>:<Square/>}</button><b>{String(index+1).padStart(2,'0')}</b><div><strong>{candidate.originalChunk}</strong><small>{candidate.status==='pending'?'Chưa gen':candidate.status==='generating'?'Đang gen…':candidate.status==='completed'?`${candidate.canonical} · ${candidate.meaningVi}`:`Lỗi · ${candidate.errorMessage}`}</small></div>{candidate.status==='completed'&&<button className="preview-button" onClick={()=>setPreview(candidate)}><Eye/>Preview</button>}<button className="generate-one" disabled={candidate.status==='generating'} onClick={()=>queue([candidate.id])}>{candidate.status==='failed'?<RefreshCw/>:<WandSparkles/>}{candidate.status==='completed'?'Gen lại':'Gen từ điển'}</button></article>)}</div></section>}
    </div>}
    {running>0&&<aside className="dictionary-floating-progress"><div><RefreshCw className="spin"/><span><strong>Đang gen từ điển</strong><small>{counts.done}/{counts.total} hoàn tất{counts.failed?` · ${counts.failed} lỗi`:''}</small></span></div><progress value={counts.done+counts.failed} max={counts.total}/></aside>}
    {preview&&<EntryPreview candidate={preview} passage={displayPassage} onClose={()=>setPreview(null)}/>} 
  </div>;
}
