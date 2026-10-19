import React,{useEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {Plus,X} from 'lucide-react';
import MultiSelectFilter from '../../../components/ui/MultiSelectFilter';
import {listScoreScales} from '../../../services/scoreScaleService';
import './ExamAddPartModal.css';

const MODE_OPTIONS={
  LISTENING:[{value:'NON_STOP',label:'Non-stop — Listening'}],
  READING:[{value:'FREESTYLE',label:'Freestyle — Reading'}],
  LISTENING_READING:[{value:'NON_STOP',label:'Non-stop — Listening'},{value:'FREESTYLE',label:'Freestyle — Reading'}],
  SPEAKING:[{value:'RECORD_NON_STOP',label:'Record non-stop — Speaking'}],
  WRITING:[{value:'WRITING_NON_STOP',label:'Writing non-stop — Writing'}],
  SPEAKING_WRITING:[{value:'RECORD_NON_STOP',label:'Record non-stop — Speaking'},{value:'WRITING_NON_STOP',label:'Writing non-stop — Writing'}],
};

export default function ExamAddPartModal({open,onClose,onSubmit,loading=false,initialData=null,examType}){
  const options=useMemo(()=>MODE_OPTIONS[examType]||[],[examType]);
  const [form,setForm]=useState({title:'',examMode:'',questionCount:'',durationMinutes:'',scoreScaleId:''});
  const [scoreScales,setScoreScales]=useState([]);
  const [loadingScales,setLoadingScales]=useState(false);
  const [scaleError,setScaleError]=useState('');
  useEffect(()=>{
    if(!open)return undefined;
    setForm({title:initialData?.title||'',examMode:initialData?.examMode||options[0]?.value||'',questionCount:initialData?.questionCount||'',durationMinutes:initialData?.configuredDurationSeconds?Math.ceil(initialData.configuredDurationSeconds/60):'',scoreScaleId:initialData?.scoreScaleId||''});
    const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const close=event=>event.key==='Escape'&&onClose?.();document.addEventListener('keydown',close);
    return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',close);};
  },[open,initialData,onClose,options]);
  const isLrMode=form.examMode==='NON_STOP'||form.examMode==='FREESTYLE';
  useEffect(()=>{
    const questionCount=Number(form.questionCount);
    if(!open||!isLrMode||!Number.isInteger(questionCount)||questionCount<=0){setScoreScales([]);setScaleError('');return undefined;}
    let active=true;setLoadingScales(true);setScaleError('');
    listScoreScales({status:'ACTIVE',scaleType:'LR_RAW_CORRECT',questionCount,page:1,limit:100})
      .then(result=>{if(active)setScoreScales(result.items||[]);})
      .catch(()=>{if(active){setScoreScales([]);setScaleError('Không thể tải danh sách thang điểm.');}})
      .finally(()=>{if(active)setLoadingScales(false);});
    return()=>{active=false;};
  },[open,isLrMode,form.questionCount]);
  if(!open)return null;
  const scaleSelectionValid=!isLrMode||Boolean(form.scoreScaleId&&scoreScales.some(scale=>scale.id===form.scoreScaleId));
  const valid=form.title.trim()&&form.examMode&&Number(form.questionCount)>0&&Number(form.durationMinutes)>0&&scaleSelectionValid;
  const update=(key,value)=>setForm(current=>({...current,[key]:value,...(key==='questionCount'||key==='examMode'?{scoreScaleId:''}:{})}));
  const submit=event=>{event?.preventDefault();if(!valid||loading)return;onSubmit({title:form.title.trim(),examMode:form.examMode,questionCount:Number(form.questionCount),configuredDurationSeconds:Number(form.durationMinutes)*60,scoreScaleId:isLrMode?form.scoreScaleId:null});};
  const scaleOptions=scoreScales.map(scale=>({value:scale.id,label:`${scale.name} · ${scale.questionCount} câu · ${scale.minScore}–${scale.maxScore} điểm`}));
  return createPortal(<div className="exam-add-part-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose?.()}>
    <section className="exam-add-part-dialog" role="dialog" aria-modal="true" aria-labelledby="exam-add-part-title">
      <header><div className="exam-add-part-heading"><span><Plus/></span><div><h2 id="exam-add-part-title">{initialData?'Chỉnh sửa phần thi':'Thêm phần thi'}</h2><p>Thiết lập thông tin và giới hạn câu hỏi của phần thi</p></div></div><button type="button" onClick={onClose} aria-label="Đóng popup"><X/></button></header>
      <form onSubmit={submit}>
        <div className="exam-add-part-field"><div><label htmlFor="exam-section-title">Tên phần thi <b>*</b></label><small>{form.title.length}/150</small></div><input id="exam-section-title" autoFocus maxLength="150" value={form.title} onChange={event=>update('title',event.target.value)} placeholder="Ví dụ: Listening"/></div>
        <div className="exam-add-part-field"><div><label>Kiểu thi <b>*</b></label></div><MultiSelectFilter single className="exam-section-mode-select" value={form.examMode} onApply={value=>update('examMode',value)} options={options} placeholder="Chọn kiểu thi" searchPlaceholder="Tìm kiểu thi..."/></div>
        <div className="exam-add-part-grid">
          <div className="exam-add-part-field"><div><label htmlFor="exam-section-question-count">Số câu hỏi <b>*</b></label></div><input id="exam-section-question-count" type="number" min="1" step="1" value={form.questionCount} onChange={event=>update('questionCount',event.target.value)} placeholder="Nhập số câu hỏi"/></div>
          <div className="exam-add-part-field"><div><label htmlFor="exam-section-duration">Thời gian (phút) <b>*</b></label></div><input id="exam-section-duration" type="number" min="1" step="1" value={form.durationMinutes} onChange={event=>update('durationMinutes',event.target.value)} placeholder="Nhập thời gian"/></div>
        </div>
        <div className="exam-add-part-field"><div><label>Thang điểm {isLrMode&&<b>*</b>}</label></div>
          <MultiSelectFilter single disabled={!isLrMode||loadingScales||Number(form.questionCount)<=0} className="exam-section-mode-select" value={form.scoreScaleId} onApply={value=>update('scoreScaleId',value)} options={scaleOptions} placeholder={isLrMode?(loadingScales?'Đang tải thang điểm...':'Chọn thang điểm phù hợp'):'Chưa hỗ trợ cho Speaking/Writing'} searchPlaceholder="Tìm thang điểm..."/>
          {isLrMode&&!loadingScales&&!scaleError&&scoreScales.length===0&&<small className="exam-add-part-help is-warning">Chưa có thang điểm Active phù hợp với số câu đã nhập.</small>}
          {scaleError&&<small className="exam-add-part-help is-error">{scaleError}</small>}
        </div>
      </form>
      <footer><p><b>*</b> Trường bắt buộc</p><div><button type="button" onClick={onClose}>Hủy</button><button type="button" className="primary" disabled={loading||loadingScales||!valid} onClick={submit}><Plus/>{loading?'Đang lưu...':initialData?'Lưu thay đổi':'Thêm phần thi'}</button></div></footer>
    </section>
  </div>,document.body);
}
