import {ArrowLeft,ArrowRight,BookOpenText,Clock3,Eye,LibraryBig,RefreshCw,Search} from 'lucide-react';
import {useCallback,useEffect,useState} from 'react';
import {getLearningMaterialHistory} from '../../../services/learningMaterialService';
import './LearningMaterialHistory.css';

const modeLabels={balanced:'Cân bằng',phrase_focused:'Ưu tiên cụm từ',single_word_focused:'Ưu tiên từ đơn'};
const statusLabel=status=>status==='completed'?'Hoàn tất':status==='generating'?'Đang gen':status==='partial'?'Một phần':status==='failed'?'Lỗi':'Bản nháp';

export default function LearningMaterialHistory({onOpenKeyVocab,onOpenDictionary,showMsg}){
  const [items,setItems]=useState([]),[loading,setLoading]=useState(false),[search,setSearch]=useState(''),[page,setPage]=useState(1),[meta,setMeta]=useState({page:1,total:0,totalPages:1});
  const load=useCallback(async()=>{setLoading(true);try{const result=await getLearningMaterialHistory({page,limit:10,search:search.trim()||undefined});setItems(result.data);setMeta(result.meta);}catch(error){showMsg?.(error.response?.data?.error||'Không thể tải lịch sử học liệu.','error');}finally{setLoading(false)}},[page,search,showMsg]);
  useEffect(()=>{const timer=setTimeout(load,250);return()=>clearTimeout(timer)},[load]);
  return <section className="learning-material-history"><header><div><h2>Lịch sử học liệu</h2><p>{meta.total||0} nội dung nguồn · Key Vocab và Dictionary dùng chung đoạn văn</p></div><label><Search/><input value={search} onChange={event=>{setSearch(event.target.value);setPage(1)}} placeholder="Tìm nội dung nguồn…"/></label></header>
    {loading?<div className="learning-material-history-empty"><RefreshCw className="spin"/>Đang tải…</div>:!items.length?<div className="learning-material-history-empty"><Clock3/>Chưa có học liệu phù hợp.</div>:<div className="learning-material-history-list">{items.map(item=><article key={item.passageId}><div className="learning-material-history-source"><strong>{item.passage}</strong><time>{new Date(item.updatedAt).toLocaleString('vi-VN')}</time></div><div className="learning-material-history-artifacts"><section className={item.keyVocabId?'available':'empty'}><span><BookOpenText/></span><div><b>Key Vocab</b><small>{item.keyVocabId?`${item.keyVocabCount} từ · TOEIC ${item.targetScore}+ · ${modeLabels[item.selectionMode]||item.selectionMode}`:'Chưa tạo'}</small></div>{item.keyVocabId&&<button onClick={()=>onOpenKeyVocab(item.keyVocabId)}><Eye/>Mở</button>}</section><section className={item.dictionaryId?'available':'empty'}><span><LibraryBig/></span><div><b>Dictionary</b><small>{item.dictionaryId?`${item.dictionaryCompletedCount}/${item.dictionaryCount} từ · ${statusLabel(item.dictionaryStatus)}${item.dictionaryFailedCount?` · ${item.dictionaryFailedCount} lỗi`:''}`:'Chưa tạo'}</small></div>{item.dictionaryId&&<button onClick={()=>onOpenDictionary(item.dictionaryId)}><Eye/>Mở</button>}</section></div></article>)}</div>}
    <footer><span>Trang {meta.page}/{meta.totalPages}</span><div><button disabled={page<=1} onClick={()=>setPage(value=>value-1)}><ArrowLeft/></button><button disabled={page>=meta.totalPages} onClick={()=>setPage(value=>value+1)}><ArrowRight/></button></div></footer>
  </section>;
}

