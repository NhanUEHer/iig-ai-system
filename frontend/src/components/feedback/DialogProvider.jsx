import {useCallback,useMemo,useRef,useState} from 'react';
import {AlertTriangle,HelpCircle,Info,X} from 'lucide-react';
import {DialogContext} from './dialogContext';
import './DialogProvider.css';

export function DialogProvider({children}){
  const [dialog,setDialog]=useState(null);
  const resolver=useRef(null);
  const finish=useCallback(value=>{resolver.current?.(value);resolver.current=null;setDialog(null)},[]);
  const open=useCallback(options=>new Promise(resolve=>{resolver.current=resolve;setDialog(options)}),[]);
  const api=useMemo(()=>({
    confirm:options=>open({type:'confirm',title:'Xác nhận thao tác',confirmText:'Xác nhận',cancelText:'Hủy',tone:'danger',...(typeof options==='string'?{message:options}:options)}),
    prompt:options=>open({type:'prompt',title:'Nhập thông tin',confirmText:'Xác nhận',cancelText:'Hủy',required:false,...(typeof options==='string'?{message:options}:options)}),
    alert:options=>open({type:'alert',title:'Thông báo',confirmText:'Đóng',tone:'info',...(typeof options==='string'?{message:options}:options)})
  }),[open]);
  return <DialogContext.Provider value={api}>{children}{dialog&&<SystemDialog dialog={dialog} onFinish={finish}/>}</DialogContext.Provider>;
}

function SystemDialog({dialog,onFinish}){
  const [value,setValue]=useState(dialog.defaultValue||'');
  const invalid=dialog.type==='prompt'&&dialog.required&&!value.trim();
  const Icon=dialog.tone==='danger'?AlertTriangle:dialog.type==='prompt'?HelpCircle:Info;
  const submit=event=>{event.preventDefault();if(invalid)return;onFinish(dialog.type==='prompt'?value.trim():true)};
  return <div className="system-dialog-backdrop" role="presentation" onMouseDown={event=>event.target===event.currentTarget&&dialog.type!=='alert'&&onFinish(dialog.type==='prompt'?null:false)}>
    <form className={`system-dialog ${dialog.tone||'primary'}`} role="dialog" aria-modal="true" aria-labelledby="system-dialog-title" onSubmit={submit}>
      <button type="button" className="system-dialog-close" aria-label="Đóng" onClick={()=>onFinish(dialog.type==='prompt'?null:false)}><X/></button>
      <span className="system-dialog-icon"><Icon/></span>
      <h2 id="system-dialog-title">{dialog.title}</h2>
      {dialog.message&&<p>{dialog.message}</p>}
      {dialog.type==='prompt'&&<label><span>{dialog.label||'Lý do'}</span><textarea autoFocus value={value} onChange={event=>setValue(event.target.value)} placeholder={dialog.placeholder||'Nhập nội dung…'} rows="4"/>{invalid&&<small>Vui lòng nhập nội dung trước khi tiếp tục.</small>}</label>}
      <footer>{dialog.type!=='alert'&&<button type="button" className="secondary" onClick={()=>onFinish(dialog.type==='prompt'?null:false)}>{dialog.cancelText}</button>}<button type="submit" className={dialog.tone==='danger'?'danger':'primary'} disabled={invalid}>{dialog.confirmText}</button></footer>
    </form>
  </div>;
}
