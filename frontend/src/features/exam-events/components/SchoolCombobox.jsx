import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Check,ChevronDown,Plus,Search,School} from 'lucide-react';
import {createExamEventSchool} from '../../../services/examEventService';
import './SchoolCombobox.css';

export default function SchoolCombobox({value=[],schools,onChange,onCreated,showMsg}){
  const [open,setOpen]=useState(false);const [query,setQuery]=useState('');const [creating,setCreating]=useState(false);const root=useRef(null);
  useEffect(()=>{const close=event=>{if(!root.current?.contains(event.target))setOpen(false);};document.addEventListener('mousedown',close);return()=>document.removeEventListener('mousedown',close);},[]);
  const normalized=query.trim().toLocaleLowerCase('vi');
  const filtered=useMemo(()=>schools.filter(item=>item.name.toLocaleLowerCase('vi').includes(normalized)),[normalized,schools]);
  const exact=schools.some(item=>item.name.trim().toLocaleLowerCase('vi')===normalized);
  const toggle=id=>onChange(value.includes(id)?value.filter(item=>item!==id):[...value,id]);
  const add=async()=>{if(!normalized||exact||creating)return;setCreating(true);try{const school=await createExamEventSchool(query.trim());onCreated(school);onChange([...value,school.id]);setQuery('');showMsg?.('Đã thêm trường mới.','success');}catch(error){showMsg?.(error.response?.data?.error||'Không thể thêm trường mới.','error');}finally{setCreating(false);}};
  const selected=schools.filter(item=>value.includes(item.id));
  return <div className={`school-combobox${open?' is-open':''}`} ref={root}><button className="school-combobox__trigger" type="button" onClick={()=>setOpen(current=>!current)}><School/><span className={selected.length?'':'placeholder'}>{selected.length?selected.map(item=>item.name).join(', '):'Chọn trường / đơn vị tổ chức'}</span><ChevronDown/></button>{open&&<div className="school-combobox__panel"><label><Search/><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Tìm tên trường..."/></label><div className="school-combobox__options">{filtered.map(item=><button type="button" key={item.id} className={value.includes(item.id)?'selected':''} onClick={()=>toggle(item.id)}><span>{item.name}</span>{value.includes(item.id)&&<Check/>}</button>)}{!filtered.length&&<p>Không tìm thấy trường phù hợp.</p>}</div><button className="school-combobox__add" type="button" disabled={!normalized||exact||creating} onClick={add}><Plus/>{creating?'Đang thêm...':`Thêm trường “${query.trim()}”`}</button></div>}</div>;
}
