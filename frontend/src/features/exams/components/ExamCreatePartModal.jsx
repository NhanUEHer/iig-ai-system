import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Pencil,Plus,Save,X} from 'lucide-react';

export default function ExamCreatePartModal({open,onClose,onSubmit,loading=false,initialData=null}){
  const [title,setTitle]=useState('');
  const editing=Boolean(initialData);
  useEffect(()=>{if(!open)return undefined;setTitle(initialData?.title||'');const previous=document.body.style.overflow;document.body.style.overflow='hidden';const close=event=>event.key==='Escape'&&onClose?.();document.addEventListener('keydown',close);return()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',close);};},[open,onClose,initialData]);
  if(!open)return null;
  const submit=event=>{event?.preventDefault();if(!title.trim()||loading)return;onSubmit({title:title.trim()});};
  return createPortal(<div className="exam-add-part-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose?.()}><section className="exam-add-part-dialog exam-create-part-dialog" role="dialog" aria-modal="true"><header><div className="exam-add-part-heading"><span>{editing?<Pencil/>:<Plus/>}</span><div><h2>{editing?'Sửa tên Part':'Thêm Part'}</h2><p>{editing?'Cập nhật tên Part đang chọn':'Tạo Part mới trong Phần thi đang chọn'}</p></div></div><button type="button" onClick={onClose} aria-label="Đóng"><X/></button></header><form onSubmit={submit}><div className="exam-add-part-field"><div><label htmlFor="exam-part-name">Tên Part <b>*</b></label><small>{title.length}/150</small></div><input id="exam-part-name" autoFocus maxLength="150" value={title} onChange={event=>setTitle(event.target.value)} placeholder="Ví dụ: Part 1"/></div></form><footer><p><b>*</b> Trường bắt buộc</p><div><button type="button" onClick={onClose}>Hủy</button><button type="button" className="primary" disabled={loading||!title.trim()} onClick={submit}>{editing?<Save/>:<Plus/>}{loading?'Đang lưu...':editing?'Lưu thay đổi':'Thêm Part'}</button></div></footer></section></div>,document.body);
}
