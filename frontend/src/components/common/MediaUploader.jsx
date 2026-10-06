import React, { useRef, useState } from 'react';
import { Download, ExternalLink, FileAudio, FileImage, FileVideo, LoaderCircle, Maximize2, PlayCircle, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { readSession } from '../../services/authSession';
import './MediaUploader.css';
import './MediaUploaderRetry.css';

const DEFAULT_MAX_SIZE = 20 * 1024 * 1024;
const typeOf = media => String(media?.mediaType || media?.type || '').toUpperCase();
const formatSize = size => size ? `${Math.max(0.1, size / 1024 / 1024).toFixed(1)} MB` : '';
const extensionOf = media => (media?.originalName || '').split('.').pop()?.toUpperCase() || '';

function matchesAcceptedType(file, acceptedTypes) {
  return acceptedTypes.some(type => type.endsWith('/*') ? file.type.startsWith(type.slice(0, -1)) : file.type === type);
}

export default function MediaUploader({ endpoint, onUploaded, onFilesSelected, items = [], onDelete, maxFileSize = DEFAULT_MAX_SIZE, accept = ['image/*', 'audio/*', 'video/*'], multiple = true, note = 'Ảnh, audio hoặc video · tối đa 20MB', height = 58, variant = 'default', disabled = false }) {
  const inputRef = useRef(null);
  const [uploads, setUploads] = useState([]);
  const [error, setError] = useState('');
  const updateUpload = (key, patch) => setUploads(current => current.map(item => item.key === key ? { ...item, ...patch } : item));
  const uploadFile = file => new Promise(resolve => {
    const key = `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;
    const xhr = new XMLHttpRequest();
    const session = readSession();
    setUploads(current => [...current, { key, name: file.name, progress: 0, status: 'uploading' }]);
    xhr.open('POST', endpoint, true);
    xhr.timeout = 60000;
    xhr.setRequestHeader('Accept', 'application/json');
    if (session?.token) xhr.setRequestHeader('Authorization', `Bearer ${session.token}`);
    xhr.upload.onprogress = event => { if (event.lengthComputable) updateUpload(key, { progress: Math.round((event.loaded / event.total) * 100) }); };
    xhr.onload = () => {
      let payload = null;
      try { payload = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { /* handled below */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        updateUpload(key, { progress: 100, status: 'success' });
        onUploaded?.(file, payload?.data || payload);
        window.setTimeout(() => setUploads(current => current.filter(item => item.key !== key)), 700);
      } else {
        const message = payload?.error || payload?.message || `Tải tệp thất bại (${xhr.status || 'không phản hồi'}).`;
        updateUpload(key, { status: 'error', message }); setError(message);
      }
      resolve();
    };
    const fail = message => { updateUpload(key, { status: 'error', message }); setError(message); resolve(); };
    xhr.onerror = () => fail('Không thể kết nối tới máy chủ để tải tệp.');
    xhr.onabort = () => fail('Tải tệp đã bị hủy.');
    xhr.ontimeout = () => fail('Tải tệp quá thời gian chờ. Vui lòng thử lại.');
    const formData = new FormData(); formData.append('file', file); xhr.send(formData);
  });
  const submitFiles = async selected => {
    if (disabled) return;
    setError('');
    setUploads(current => current.filter(item => item.status === 'uploading'));
    const valid = selected.filter(file => {
      if (!matchesAcceptedType(file, accept)) { setError(`Tệp ${file.name} không đúng định dạng cho phép.`); return false; }
      if (file.size > maxFileSize) { setError(`Tệp ${file.name} vượt quá dung lượng cho phép.`); return false; }
      return true;
    });
    const files = multiple ? valid : valid.slice(0, 1);
    if (!endpoint) { if (files.length) onFilesSelected?.(files); return; }
    for (const file of files) await uploadFile(file);
  };
  const handleFiles = event => { const selected = Array.from(event.target.files || []); event.target.value = ''; submitFiles(selected); };
  const handleDrop = event => { event.preventDefault(); submitFiles(Array.from(event.dataTransfer?.files || [])); };
  const activeUpload = uploads[0];
  const hasMedia = items.length > 0;
  return <div className={`media-uploader media-uploader--${variant} ${disabled ? 'is-disabled' : ''}`} aria-disabled={disabled}>
    <input ref={inputRef} className="media-uploader__input" type="file" accept={accept.join(',')} multiple={multiple} disabled={disabled} onChange={handleFiles} />
    {activeUpload ? <UploadProgress upload={activeUpload} onRetry={() => { if (disabled) return; setUploads([]); setError(''); inputRef.current?.click(); }} /> : hasMedia && variant === 'content' ? <ContentMediaPreview media={items[0]} onDelete={onDelete} onReplace={() => inputRef.current?.click()} disabled={disabled} /> : <button type="button" className="media-uploader__drop-area" style={{ minHeight: height }} disabled={disabled} onClick={() => inputRef.current?.click()} onDragOver={event => { if (!disabled) event.preventDefault(); }} onDrop={handleDrop}><div className="media-uploader__prompt"><UploadCloud /><p><strong>Drag &amp; drop</strong> or browse files</p>{note && <small>{note}</small>}</div></button>}
    {error && !activeUpload && <small className="media-uploader__error">{error}</small>}
    {hasMedia && variant !== 'content' && <MediaGallery items={items} onDelete={onDelete} />}
  </div>;
}

function UploadProgress({ upload, onRetry }) {
  const failed = upload.status === 'error';
  return <div className={`media-uploader__progress is-${upload.status}`} aria-live="polite"><div>{failed ? <RefreshCw /> : <LoaderCircle />}<strong title={upload.name}>{failed ? 'Tải lên thất bại' : upload.name}</strong><span>{upload.progress}%</span></div><i><b style={{ width: `${upload.progress}%` }} /></i>{failed && <footer><small>{upload.message}</small><button type="button" onClick={onRetry}><RefreshCw />Chọn lại file</button></footer>}</div>;
}

function ContentMediaPreview({ media, onDelete, onReplace, disabled = false }) {
  const type = typeOf(media);
  const Icon = type === 'AUDIO' ? FileAudio : type === 'VIDEO' ? FileVideo : FileImage;
  const fileInfo = [formatSize(media.fileSize), extensionOf(media)].filter(Boolean).join(' • ');
  return <article className={`content-media-preview content-media-preview--${type.toLowerCase()}`}>
    {type === 'VIDEO' && <div className="content-media-preview__visual"><video src={media.url} preload="metadata" /><PlayCircle /><span>HD</span></div>}
    {type === 'IMAGE' && <div className="content-media-preview__visual"><img src={media.url} alt={media.originalName || 'Hình ảnh nội dung'} /><Maximize2 /></div>}
    <div className="content-media-preview__meta"><div className="content-media-preview__file"><span><Icon /></span><div><strong title={media.originalName}>{media.originalName || 'Tệp media'}</strong><small>{fileInfo}</small></div></div><button type="button" disabled={disabled} onClick={() => onDelete?.(media)} aria-label={`Xóa ${media.originalName || 'media'}`}><Trash2 /></button></div>
    {type === 'AUDIO' && media.url && <audio key={media.url} className="content-media-preview__audio" controls preload="metadata"><source src={media.url} type={media.mimeType || 'audio/mpeg'} /></audio>}
    <footer>{type !== 'AUDIO'&&<a href={media.url} target="_blank" rel="noreferrer">{type === 'IMAGE' ? <Maximize2 /> : <ExternalLink />}{type === 'IMAGE' ? 'Phóng to' : 'Xem trước'}</a>}<div>{type === 'AUDIO' && <a href={media.url} download><Download />Tải về</a>}<button type="button" disabled={disabled} onClick={onReplace}><RefreshCw />Đổi file</button></div></footer>
  </article>;
}

export function MediaPreview({ media, onDelete }) {
  const type = typeOf(media); const Icon = type === 'AUDIO' ? FileAudio : type === 'VIDEO' ? FileVideo : FileImage;
  return <article className="media-preview-card"><div className="media-preview-meta"><Icon aria-hidden="true" /><strong title={media.originalName}>{media.originalName || 'Tệp media'}</strong><span>{formatSize(media.fileSize)}</span><button type="button" onClick={() => onDelete?.(media)} aria-label={`Xóa ${media.originalName || 'media'}`}><Trash2 /></button></div><div className={`media-preview-content media-preview-content--${type.toLowerCase() || 'unknown'}`}>{type === 'IMAGE' && media.url && <img src={media.url} alt={media.originalName || 'Media'} />}{type === 'VIDEO' && media.url && <video src={media.url} controls preload="metadata" />}{type === 'AUDIO' && media.url && <audio src={media.url} controls />}</div></article>;
}

export function MediaGallery({ items = [], onDelete }) { return items.length ? <div className="media-preview-grid">{items.map(media => <MediaPreview key={media.id} media={media} onDelete={onDelete} />)}</div> : null; }
