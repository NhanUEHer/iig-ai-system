import React,{useEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {Plus,X} from 'lucide-react';
import MultiSelectFilter from '../../../components/ui/MultiSelectFilter';
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
  const [form,setForm]=useState({title:'',examMode:'',questionCount:'',durationMinutes:''});
  useEffect(()=>{
    if(!open)return undefined;
    setForm({title:initialData?.title||'',examMode:initialData?.examMode||options[0]?.value||'',questionCount:initialData?.questionCount||'',durationMinutes:initialData?.configuredDurationSeconds?Math.ceil(initialData.configuredDurationSeconds/60):''});
    const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const close=event=>event.key==='Escape'&&onClose?.();document.addEventListener('keydown',close);
    return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',close);};
  },[open,initialData,onClose,options]);
  if(!open)return null;
  const valid=form.title.trim()&&form.examMode&&Number(form.questionCount)>0&&Number(form.durationMinutes)>0;
  const update=(key,value)=>setForm(current=>({...current,[key]:value}));
  const submit=event=>{event?.preventDefault();if(!valid||loading)return;onSubmit({title:form.title.trim(),examMode:form.examMode,questionCount:Number(form.questionCount),configuredDurationSeconds:Number(form.durationMinutes)*60,scoreScaleId:null});};
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
        <div className="exam-add-part-field"><div><label>Thang điểm</label></div><input value="" disabled readOnly placeholder="Sẽ cấu hình sau"/></div>
      </form>
      <footer><p><b>*</b> Trường bắt buộc</p><div><button type="button" onClick={onClose}>Hủy</button><button type="button" className="primary" disabled={loading||!valid} onClick={submit}><Plus/>{loading?'Đang lưu...':initialData?'Lưu thay đổi':'Thêm phần thi'}</button></div></footer>
    </section>
  </div>,document.body);
}
