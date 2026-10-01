import React,{useEffect,useMemo,useState} from 'react';
import {Copy,Download,ExternalLink,Link2,QrCode} from 'lucide-react';
import QRCode from 'qrcode';
import './PublicExamAccessCard.css';

const publicBase=()=>{
  const configured=String(import.meta.env.VITE_PUBLIC_EXAM_BASE_URL||'').trim().replace(/\/$/,'');
  if(configured)return configured;
  return import.meta.env.DEV?'http://localhost:5174':window.location.origin;
};

const publicExamUrl=eventId=>`${publicBase()}/events/${encodeURIComponent(eventId)}`;

export default function PublicExamAccessCard({eventId,eventName,status,showMsg}){
  const url=useMemo(()=>publicExamUrl(eventId),[eventId]);
  const [qr,setQr]=useState('');
  const published=status==='PUBLISHED';

  useEffect(()=>{
    let active=true;
    QRCode.toDataURL(url,{width:440,margin:2,errorCorrectionLevel:'M',color:{dark:'#073b2b',light:'#ffffff'}})
      .then(value=>active&&setQr(value))
      .catch(()=>active&&setQr(''));
    return()=>{active=false;};
  },[url]);

  const copy=async()=>{
    try{await navigator.clipboard.writeText(url);showMsg?.('Đã sao chép link kỳ thi công khai.','success');}
    catch{showMsg?.('Không thể sao chép tự động. Hãy chọn và sao chép đường dẫn.','error');}
  };
  const download=()=>{
    if(!qr)return;
    const anchor=document.createElement('a');
    anchor.href=qr;
    anchor.download=`qr-${String(eventName||eventId).trim().replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||eventId}.png`;
    anchor.click();
  };

  return <section className="public-exam-access" aria-labelledby="public-exam-access-title">
    <header>
      <span><Link2/></span>
      <div><h2 id="public-exam-access-title">Link tham gia kỳ thi</h2><p>Chia sẻ đường dẫn hoặc QR này để sinh viên vào làm bài.</p></div>
      <em className={published?'is-live':'is-draft'}><i/>{published?'Đang công khai':'Chưa công khai'}</em>
    </header>
    <div className="public-exam-access-body">
      <div className="public-exam-qr">
        {qr?<img src={qr} alt={`QR tham gia ${eventName||'kỳ thi'}`}/>:<span><QrCode/>Đang tạo QR...</span>}
      </div>
      <div className="public-exam-link">
        <label htmlFor="public-event-url">Đường dẫn dành cho thí sinh</label>
        <div><input id="public-event-url" value={url} readOnly onFocus={event=>event.target.select()}/><button type="button" onClick={copy}><Copy/>Sao chép</button></div>
        {!published&&<p>Kỳ thi đang ở trạng thái nháp. Hãy chuyển sang “Đã xuất bản” để sinh viên truy cập được.</p>}
        <nav>
          <button type="button" onClick={download} disabled={!qr}><Download/>Tải mã QR</button>
          <a href={url} target="_blank" rel="noreferrer"><ExternalLink/>Mở trang thí sinh</a>
        </nav>
      </div>
    </div>
  </section>;
}
