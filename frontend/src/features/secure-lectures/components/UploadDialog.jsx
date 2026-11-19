import React, { useEffect, useRef, useState } from 'react';
import { Check, FileCode2, LockKeyhole, Upload, X } from 'lucide-react';
import { Button, Modal } from '../../../design-system-v2';
import { createSecureLecture, secureLectureError } from '../../../services/secureLecturesApi';
import { folderPathLabel } from '../../../utils/folderTree';
import { FolderPickerDialog } from './FolderDialogs';
import './SecureLectureDialogs.css';

const MAX_SIZE = 20 * 1024 * 1024;
const formatSize = value => value < 1024 * 1024 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;

async function inspectFile(file) {
  if (!file?.name.toLowerCase().endsWith('.html') && !file?.name.toLowerCase().endsWith('.htm')) throw new Error('Chỉ chấp nhận file .html.');
  if (file.size > MAX_SIZE) throw new Error('File vượt quá dung lượng tối đa 20 MB.');
  const html = await file.text();
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const title = parsed.querySelector('title')?.textContent?.trim() || file.name.replace(/\.html?$/i, '');
  const slides = Math.max(parsed.querySelectorAll('section, .slide').length, 1);
  const hasAudio = Boolean(parsed.querySelector('audio, source[src^="data:audio"], [src^="data:audio"]'));
  const externalHosts = new Set();
  parsed.querySelectorAll('[src], [href]').forEach(element => {
    const value = element.getAttribute('src') || element.getAttribute('href');
    try { const url = new URL(value, window.location.origin); if (url.origin !== window.location.origin && ['http:', 'https:'].includes(url.protocol)) externalHosts.add(url.hostname); } catch { /* Ignore malformed URLs; the server is authoritative. */ }
  });
  return { title, slides, hasAudio, externalHosts: [...externalHosts] };
}

export default function UploadDialog({ open, initialFile = null, initialFolderId = null, folders, onClose, onUploaded, showMsg }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState(null);
  const [title, setTitle] = useState('');
  const [folderId, setFolderId] = useState(initialFolderId);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploaded, setUploaded] = useState(null);

  const chooseFile = async nextFile => {
    if (!nextFile) return;
    setError(''); setMeta(null); setFile(nextFile);
    try {
      const inspected = await inspectFile(nextFile);
      setMeta(inspected); setTitle(inspected.title);
    } catch (inspectError) { setFile(null); setError(inspectError.message); }
  };

  useEffect(() => {
    if (!open) return;
    setFile(null); setMeta(null); setTitle(''); setFolderId(initialFolderId || null); setNote(''); setError(''); setBusy(false); setProgress(0); setUploaded(null);
    if (initialFile) chooseFile(initialFile);
  }, [open, initialFile, initialFolderId]);

  const upload = async () => {
    if (!file || !title.trim()) return;
    setBusy(true); setError(''); setProgress(0);
    try {
      const lecture = await createSecureLecture({ file, title: title.trim(), folderId, note: note.trim() }, event => {
        if (event.total) setProgress(Math.round(event.loaded / event.total * 100));
      });
      setUploaded(lecture);
      showMsg?.('Đã upload bài giảng.', 'success');
      onUploaded(lecture);
    } catch (requestError) { setError(secureLectureError(requestError, 'Không thể upload bài giảng.')); }
    finally { setBusy(false); }
  };

  return <>
    <Modal open={open} title="Upload bài giảng" size="md" onClose={() => !busy && onClose()} footer={uploaded ? <Button onClick={onClose}>Hoàn tất</Button> : <><Button variant="outline" disabled={busy} onClick={onClose}>Huỷ</Button><Button icon={<Upload />} loading={busy} disabled={!file || !title.trim()} onClick={upload}>{busy ? `Đang upload ${progress}%` : 'Upload'}</Button></>}>
      <div className="sl-dialog-body sl-upload-dialog">
        <button type="button" className={`sl-upload-drop${dragging ? ' is-dragging' : ''}`} onClick={() => inputRef.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); }}>
          <Upload /><strong>Kéo thả file .html vào đây</strong><span>hoặc <u>chọn file</u> · 1 file, tối đa 20 MB · audio/ảnh phải nhúng sẵn</span>
        </button>
        <input ref={inputRef} hidden type="file" accept=".html,.htm,text/html" onChange={event => chooseFile(event.target.files?.[0])} />
        {file && meta && <div className="sl-upload-file"><FileCode2 /><div><strong>{file.name}</strong><span>{formatSize(file.size)} · khoảng {uploaded?.currentVersion?.meta?.slideCountGuess ?? meta.slides} slide{(uploaded?.currentVersion?.meta?.hasAudio ?? meta.hasAudio) ? ' · có audio nhúng' : ''}{(uploaded?.currentVersion?.meta?.externalHosts ?? meta.externalHosts).length ? ` · ${(uploaded?.currentVersion?.meta?.externalHosts ?? meta.externalHosts).length} tài nguyên ngoài` : ''}</span></div><em><Check />{uploaded ? 'Server đã kiểm tra' : 'Hợp lệ'}</em>{!uploaded && <button type="button" aria-label="Bỏ file" onClick={() => { setFile(null); setMeta(null); }}><X /></button>}</div>}
        {error && <p className="sl-dialog-error" role="alert">{error}</p>}
        {uploaded && <div className="sl-upload-success"><Check /><span>Upload thành công phiên bản v{uploaded.currentVersion?.versionNo || 1}. Metadata phía trên là kết quả kiểm tra từ server.</span></div>}
        <label className="sl-dialog-field"><span>Tên bài giảng</span><input disabled={Boolean(uploaded)} maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="Tự lấy từ thẻ title hoặc tên file" /></label>
        <label className="sl-dialog-field"><span>Thư mục</span><button type="button" disabled={Boolean(uploaded)} className="sl-folder-select" onClick={() => setPickerOpen(true)}>{folderId ? folderPathLabel(folders, folderId) : 'Chưa phân loại'}</button></label>
        <label className="sl-dialog-field"><span>Ghi chú phiên bản</span><input disabled={Boolean(uploaded)} value={note} onChange={event => setNote(event.target.value)} placeholder="Ví dụ: Thêm audio slide 2" /></label>
        <div className="sl-private-note"><LockKeyhole /><span>File được lưu riêng tư, không có link công khai. Chỉ mở được qua link chia sẻ có token.</span></div>
        {busy && <div className="sl-upload-progress"><i style={{ width: `${progress}%` }} /></div>}
      </div>
    </Modal>
    <FolderPickerDialog open={pickerOpen} folders={folders} currentId={folderId} title="Chọn thư mục cho bài giảng" onClose={() => setPickerOpen(false)} onConfirm={id => { setFolderId(id); setPickerOpen(false); }} />
  </>;
}
