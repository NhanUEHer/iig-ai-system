import React, { useEffect, useRef, useState } from 'react';
import { FileAudio, FileImage, FileVideo, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { apiError } from './constants';

const icons = { audio: FileAudio, image: FileImage, video: FileVideo };
const acceptByType = { audio: 'audio/*', image: 'image/png,image/jpeg', video: 'video/mp4,video/quicktime' };

export default function MediaField({ type, mediaId, url, disabled, onUpload, onRemove, showMsg }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(url || '');
  useEffect(() => { setCurrentUrl(url || ''); }, [url]);
  const Icon = icons[type] || UploadCloud;
  const choose = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try { setBusy(true); const media = await onUpload(file); setCurrentUrl(media?.url || ''); showMsg?.('Đã tải media.', 'success'); }
    catch (error) { showMsg?.(apiError(error, 'Không thể tải media.'), 'error'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    try { setBusy(true); await onRemove(); setCurrentUrl(''); showMsg?.('Đã xóa media.', 'success'); }
    catch (error) { showMsg?.(apiError(error, 'Không thể xóa media.'), 'error'); }
    finally { setBusy(false); }
  };
  return <div className={`qm-media-field ${disabled ? 'is-disabled' : ''}`}>
    <input ref={input} type="file" accept={acceptByType[type]} disabled={disabled || busy} onChange={choose} />
    <div className="qm-media-field__head"><span><Icon />{type === 'audio' ? 'Audio' : type === 'image' ? 'Hình ảnh' : 'Video'}</span>{mediaId && <small>Đã tải lên</small>}</div>
    {mediaId ? <div className="qm-media-field__current">{type === 'audio' && currentUrl ? <audio controls src={currentUrl} /> : type === 'image' && currentUrl ? <img src={currentUrl} alt="Media câu hỏi" /> : type === 'video' && currentUrl ? <video controls src={currentUrl} /> : <span><Icon />Media đã lưu</span>}<div><button type="button" disabled={disabled || busy} onClick={() => input.current?.click()}><RefreshCw />Đổi file</button><button type="button" disabled={disabled || busy} onClick={remove}><Trash2 />Xóa</button></div></div>
    : <button type="button" className="qm-media-field__empty" disabled={disabled || busy} onClick={() => input.current?.click()}><UploadCloud /><span>{busy ? 'Đang tải…' : 'Chọn file'}</span></button>}
  </div>;
}
