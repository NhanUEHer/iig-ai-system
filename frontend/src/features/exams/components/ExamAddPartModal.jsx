import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Plus,X} from 'lucide-react';
import RichTextEditor from '../../../components/common/RichTextEditor';
import './ExamAddPartModal.css';

export default function ExamAddPartModal({open,onClose,onSubmit,loading=false,initialData=null}){
  const [title,setTitle]=useState('');
  const [instruction,setInstruction]=useState('');
  const [preview,setPreview]=useState(false);
  useEffect(()=>{
    if(!open)return undefined;
    setTitle(initialData?.title||'');setInstruction(initialData?.instruction||'');setPreview(false);
    const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const close=event=>event.key==='Escape'&&onClose?.();document.addEventListener('keydown',close);
    return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',close);};
  },[open,initialData,onClose]);
  if(!open)return null;
  const valid=title.trim()&&instruction.replace(/<[^>]*>/g,'').trim();
  const submit=event=>{event?.preventDefault();if(!valid||loading)return;onSubmit({title:title.trim(),instruction:instruction.trim()});};
  return createPortal(<div className="exam-add-part-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose?.()}>
    <section className="exam-add-part-dialog" role="dialog" aria-modal="true" aria-labelledby="exam-add-part-title">
      <header><div className="exam-add-part-heading"><span><Plus/></span><div><h2 id="exam-add-part-title">{initialData?'Chỉnh sửa phần thi':'Thêm phần thi mới'}</h2><p>Cấu hình phần thi con và hướng dẫn làm bài cho thí sinh</p></div></div><button type="button" onClick={onClose} aria-label="Đóng popup"><X/></button></header>
      <form onSubmit={submit}><div className="exam-add-part-field"><div><label htmlFor="exam-part-title">Tên phần thi <b>*</b></label><small>Tối đa 150 ký tự</small></div><input id="exam-part-title" autoFocus maxLength="150" value={title} onChange={event=>setTitle(event.target.value)} placeholder="Ví dụ: Phần 3: Listening Comprehension - Part 1 & Part 2"/></div><div className="exam-add-part-field"><div><label>Giới thiệu &amp; Hướng dẫn phần thi (Rich Text / HTML) <b>*</b></label><button type="button" className="exam-add-part-preview-toggle" onClick={()=>setPreview(current=>!current)}>{preview?'Chỉnh sửa (Edit)':'Xem trước (Preview)'}</button></div>{preview?<div className="exam-add-part-preview" dangerouslySetInnerHTML={{__html:instruction}}/>:<RichTextEditor value={instruction} onChange={setInstruction} placeholder="Nhập hướng dẫn làm bài chi tiết, quy định về ghi âm, thiết bị hoặc quy chế tính điểm..." minHeight="160px" variant="stitch"/>}</div></form>
      <footer><p><b>*</b> Trường có dấu sao là bắt buộc</p><div><button type="button" onClick={onClose}>Hủy</button><button type="button" className="primary" disabled={loading||!valid} onClick={submit}><Plus/>{loading?'Đang lưu...':initialData?'Lưu thay đổi':'Thêm phần thi'}</button></div></footer>
    </section>
  </div>,document.body);
}
